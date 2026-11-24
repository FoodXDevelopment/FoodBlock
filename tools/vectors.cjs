#!/usr/bin/env node
'use strict';
// The one vector generator: node tools/vectors.cjs [--dry]
//
// Writes spec/vectors.json (the sound part's and the word ops' cases, core.md section 12) and spec/conventions-vectors.json (the
// cases of every other op: readings, library tools and a node's own business) from both engines:
//   - every case's answer is the oracle's (spec/oracle/fb.cjs, written from the text alone);
//   - the core (sdk/rust, through its WebAssembly door) must give the same answer under the case's lens, or the case is a fault: the
//     generator lists it and writes nothing (fix the text first, then the engine that disagrees, and run it again).
// Its inputs are the two files themselves (a case's op and arguments are its question), the steps in tools/vectors/steps.cjs that move
// inputs to the current shapes, and the oracle's stories (spec/oracle/stories/export.cjs, written to sdk/rust/tests/fixtures/<subject>.json).
// Every block whose bytes change, or whose signature no longer opens, is re-signed by its own test key (tools/vectors/keys.json: test keys
// only, never for anything real), to a fixed point; every id that changes is replaced wherever it is written. Run on its own output it
// changes nothing. tools/vectors/last-run.json says what it kept, renewed (and why), deleted (and why) and added.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const O = require('../spec/oracle/fb.cjs');
const { call } = require('../sdk/javascript/src/core.cjs');
const M = require('./vectors/steps.cjs');

const args = process.argv.slice(2);
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const DRY = args.includes('--dry');
const FILE = path.join(ROOT, 'spec/vectors.json'), CFILE = path.join(ROOT, 'spec/conventions-vectors.json');
const KEYS = path.join(__dirname, 'vectors/keys.json'), LOG = path.join(__dirname, 'vectors/last-run.json');
const P = require('../spec/protocol.json'), CONV = require('../spec/conventions.json');

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const clone = (x) => JSON.parse(JSON.stringify(x));
const sha = (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex');
const sortKeys = (x) => (Array.isArray(x) ? x.map(sortKeys) : isObj(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, sortKeys(x[k])])) : x);
const J = (x) => JSON.stringify(sortKeys(x));
const same = (a, b) => J(a) === J(b);
const log = (...a) => process.stderr.write(a.join(' ') + '\n');
const codesOf = (list) => [...new Set((Array.isArray(list) ? list : []).map((x) => x && x.code))];
const canon = (b) => O.canonOf({ type: b.type, state: b.state, refs: b.refs });
const suiteOfId = (id) => (typeof id === 'string' && id.startsWith('sm3:') ? 'sm' : 'std');
const hashOf = (b, suite) => O.hashOfBlock({ type: b.type, state: b.state, refs: b.refs }, suite || 'std');

// ============================================================ load
const V = JSON.parse(fs.readFileSync(FILE, 'utf8'));
if (fs.existsSync(CFILE)) V.door.push(...JSON.parse(fs.readFileSync(CFILE, 'utf8')).door);
const report = { kept: [], renewed: [], deleted: [], added: [], faults: [], resigned: 0, rekeyed: 0, ids: 0 };

// ============================================================ 1. the inputs in the current shapes
let bank, allPubs = new Set(), pubmap = new Map();
M.prepare(V);
V.door = V.door.map((c) => {
  const n = M.convertOp(c);
  if (n !== c) { n._from = { op: c.op, name: c.name }; }
  return n;
});

// ============================================================ 2. keys
// A bank of test keys: public key -> { private_key, suite }. Kept in tools/vectors/keys.json so a later run can re-sign without guessing.
bank = new Map(fs.existsSync(KEYS) ? Object.entries(JSON.parse(fs.readFileSync(KEYS, 'utf8'))) : []);
const bankAdd = (kp, suite) => { if (kp && kp.public_key_sign && kp.private_key && !bank.has(kp.public_key_sign)) bank.set(kp.public_key_sign, { private_key: kp.private_key, suite: suite || kp.suite || 'std' }); };
for (const k of Object.values(V.keys)) bankAdd(k, k.suite);
const encBank = new Map(); // public_key_encrypt -> x25519 private (or the suite's), for opening sealed copies
for (const k of Object.values(V.keys)) if (k.public_key_encrypt && k.x25519_private) encBank.set(k.public_key_encrypt, { priv: k.x25519_private, suite: k.suite || 'std' });

for (const m of JSON.stringify(V).matchAll(/"(30[0-9a-f]{40,200})"/g)) if (O.suiteOfKey(m[1])) allPubs.add(m[1]);
// ============================================================ 3. every block, to a fixed point
// holders: flat { hash?, type, state, refs, signature?, suite? } or a story entry { hash, block: { type, state, refs }, signature }
const holders = [];
// a case from a story is already in the current shapes: its blocks are the story's own, and no step moves them (they may hold what is deleted,
// to ask that it is refused)
const isStoryCase = (x) => isObj(x) && typeof x.story === 'string' && Array.isArray(x.args);
const walk = (x) => {
  if (Array.isArray(x)) return x.forEach(walk);
  if (!isObj(x) || isStoryCase(x)) return;
  if (typeof x.type === 'string' && isObj(x.state) && isObj(x.refs)) holders.push({ o: x, body: x });
  else if (isObj(x.block) && typeof x.block.type === 'string' && isObj(x.block.state) && isObj(x.block.refs) && typeof x.hash === 'string') holders.push({ o: x, body: x.block });
  for (const v of Object.values(x)) walk(v);
};
walk(V);
const idmap = new Map();
// commitments (privacy.md): a salted hash of a recipient whose id moves is the salted hash of her new id; known before anything moves, so a
// block whose audience changes takes its new id in the same fixed point
const commitOf = new Map(); // commitment -> [salt, recipient id]
{
  const salts = new Set(), ids = new Set();
  const w = (x) => { if (Array.isArray(x)) x.forEach(w); else if (isObj(x)) { if (typeof x.salt === 'string') salts.add(x.salt); if (typeof x.hash === 'string') ids.add(x.hash); Object.values(x).forEach(w); } };
  w(V);
  for (const salt of salts) for (const id of ids) { try { commitOf.set(O.saltedHash(salt, id, suiteOfId(id)), [salt, id]); } catch { /* not a salt */ } }
}
const remapCommit = (v) => { const c = commitOf.get(v); return c && idmap.has(c[1]) ? O.saltedHash(c[0], idmap.get(c[1]), suiteOfId(idmap.get(c[1]))) : null; };
const remapValue = (v) => {
  if (typeof v === 'string') return idmap.has(v) ? idmap.get(v) : pubmap.has(v) ? pubmap.get(v) : remapCommit(v) || v;
  if (Array.isArray(v)) {
    const out = v.map(remapValue);
    const wasSorted = v.length > 1 && v.every((x, i) => typeof x === 'string' && (i === 0 || v[i - 1] < x));
    if (wasSorted && out.some((x, i) => x !== v[i])) out.sort();
    return out;
  }
  if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, y]) => [idmap.has(k) ? idmap.get(k) : k, remapValue(y)]));
  return v;
};
// a signed message part inside a block (a receipt's push answer) or beside one: { ..., signature } with `node` or `signer`. One whose
// signature opened under a key keeps that key: when its content moves, it is signed again by it (msgSigner is filled before anything moves)
const isMsgPart = (x) => isObj(x) && typeof x.signature === 'string' && ('node' in x || 'signer' in x) && !(typeof x.type === 'string' && isObj(x.state));
const msgSigner = new Map(); // signature -> public key
const resignMessages = (x) => {
  if (Array.isArray(x)) return x.map(resignMessages);
  if (!isObj(x)) return x;
  const out = Object.fromEntries(Object.entries(x).map(([k, v]) => [k, resignMessages(v)]));
  if (isMsgPart(out) && msgSigner.has(x.signature)) {
    const pub = msgSigner.get(x.signature);
    let opens = false; try { opens = O.verifyMessage(out, pub); } catch { opens = false; }
    if (!opens) { const k = keyFor(pub); return O.signMessage(out, k.private_key, k.suite); }
  }
  return out;
};
const next = (body) => { const a = M.after(body); return { type: a.type, state: resignMessages(remapValue(a.state)), refs: remapValue(a.refs) }; };

// who may sign for an author: her genesis key and every key a key grant or voice list names
const pubsOf = new Map();
const note = (id, pub) => { if (typeof id === 'string' && typeof pub === 'string') { if (!pubsOf.has(id)) pubsOf.set(id, new Set()); pubsOf.get(id).add(pub); } };
const grantKeys = new Set();
const keysIn = (x, out) => { if (typeof x === 'string') { if (x.startsWith('30') && allPubs.has(x)) out.add(x); } else if (Array.isArray(x)) x.forEach((y) => keysIn(y, out)); else if (isObj(x)) Object.values(x).forEach((y) => keysIn(y, out)); return out; };
for (const h of holders) {
  const b = h.body;
  if (b.type === 'actor' && b.refs.author === undefined) note(typeof h.o.hash === 'string' ? h.o.hash : hashOf(b), b.state.public_key_sign);
  if (b.type === 'grant' || b.type === 'actor') for (const k of keysIn(b.state, new Set())) { grantKeys.add(k); for (const r of ['subject', 'to', 'author']) note(b.refs[r], k); }
}
// who signed each message part, read before anything moves: the key of the node or signer it names, or any test key with a name
{
  const walkMsgs = (x) => {
    if (Array.isArray(x)) return x.forEach(walkMsgs);
    if (!isObj(x)) return;
    if (isMsgPart(x) && !msgSigner.has(x.signature)) {
      const cands = [...(pubsOf.get(x.node) || []), ...(pubsOf.get(x.signer) || []), ...Object.values(V.keys).map((k) => k.public_key_sign)];
      for (const pub of cands) { let ok = false; try { ok = O.verifyMessage(x, pub); } catch { ok = false; } if (ok) { msgSigner.set(x.signature, pub); break; } }
    }
    Object.values(x).forEach(walkMsgs);
  };
  walkMsgs(V);
}
// who signed each sealed copy's header, read before anything moves (a header's signature is its block's: the key of its author)
const headerSigner = new Map(); // header_signature -> public key
{
  const w = (x) => {
    if (Array.isArray(x)) return x.forEach(w);
    if (!isObj(x)) return;
    if (isObj(x.header) && typeof x.header_signature === 'string' && !headerSigner.has(x.header_signature)) {
      for (const pub of [...(pubsOf.get(x.header.author) || []), ...grantKeys]) { let ok = false; try { ok = O.verifyBytes(Buffer.from(O.jcs(x.header), 'utf8'), x.header_signature, pub); } catch { ok = false; } if (ok) { headerSigner.set(x.header_signature, pub); break; } }
    }
    Object.values(x).forEach(w);
  };
  w(V);
}
const oldBytesOpen = (body, sig, pub) => { try { return O.verifyBytes(Buffer.from(canon(body), 'utf8'), sig, pub); } catch { return false; } };
const newOpen = (body, sig, pub) => { try { return O.verifyBlock({ type: body.type, state: body.state, refs: body.refs }, sig, pub); } catch { return false; } };
// the key whose signature this is, under the old rule (the body's bytes) or the current one (the header): { pub, rule }
const signerCache = new Map();
const signerOf = (body, sig) => {
  if (typeof sig !== 'string') return null;
  const ck = sig + '|' + canon(body);
  if (signerCache.has(ck)) return signerCache.get(ck);
  const cands = [body.state.public_key_sign, ...(pubsOf.get(body.refs.author) || [])].filter((p) => typeof p === 'string');
  let found = null;
  for (const p of cands) if (newOpen(body, sig, p)) { found = { pub: p, rule: 'new' }; break; }
  if (!found) for (const p of cands) if (oldBytesOpen(body, sig, p)) { found = { pub: p, rule: 'old' }; break; }
  if (!found) for (const p of grantKeys) if (oldBytesOpen(body, sig, p) || newOpen(body, sig, p)) { found = { pub: p, rule: newOpen(body, sig, p) ? 'new' : 'old' }; note(body.refs.author, p); break; }
  signerCache.set(ck, found);
  return found;
};
// the private key for a public key; a key nobody can name is replaced everywhere by a fixed test key (its genesis then names the new key)
const keyFor = (pub) => {
  if (pubmap.has(pub)) return bank.get(pubmap.get(pub));
  if (bank.has(pub)) return bank.get(pub);
  const suite = O.suiteOfKey(pub) || 'std';
  const kp = O.keypair(sha('foodblock vectors re-keyed: ' + pub), suite);
  bankAdd(kp, suite); pubmap.set(pub, kp.public_key_sign); report.rekeyed++;
  return bank.get(kp.public_key_sign);
};
const signWith = (body, k) => O.signBlock({ type: body.type, state: body.state, refs: body.refs }, k.private_key, k.suite);

const idOfHolder = (h) => (typeof h.o.hash === 'string' ? h.o.hash : hashOf(h.body, h.o.suite));
const unique = new Map();
const own = (h, id) => hashOf(h.body, suiteOfId(id)) === id;
for (const h of holders) {
  if (typeof h.o.hash !== 'string' && typeof h.o.signature !== 'string') continue;
  const id = idOfHolder(h);
  if (!unique.has(id) || (!own(unique.get(id), id) && own(h, id))) unique.set(id, h);
}
const origCanon = new Map([...unique].map(([id, h]) => [id, canon(h.body)]));
const origSig = new Map([...unique].map(([id, h]) => [id, h.o.signature]));
const origBody = new Map([...unique].map(([id, h]) => [id, clone({ type: h.body.type, state: h.body.state, refs: h.body.refs })]));
const newBody = new Map(), newSig = new Map();
const isGenesis = (b) => b.type === 'actor' && isObj(b.state) && typeof b.state.public_key_sign === 'string' && b.refs.author === undefined && !('seq' in b.state);
// a key that must be replaced (nobody can name it) is replaced before any block is signed, so a genesis names the new key
for (let pass = 1; ; pass++) {
  let grew = 0;
  for (const [old, h] of unique) {
    if (typeof h.o.hash === 'string' && !own(h, old)) continue; // a copy whose bytes are not its written id: a lie a case shows
    const n = next(h.body);
    const changed = canon(n) !== canon(h.body);
    const who = signerOf(h.body, h.o.signature);
    // a block is signed again only where it must be: its bytes changed, its signature is over the old bytes, or its key was replaced. A block
    // that already opens over its header, unchanged, is left as it is, whoever holds its key (a story's block the oracle signed)
    const needsSig = typeof h.o.signature === 'string' && who && (changed || who.rule === 'old' || pubmap.has(who.pub));
    if (!changed && !needsSig) continue;
    let body = n;
    if (who && needsSig && !bank.has(who.pub) && !pubmap.has(who.pub)) keyFor(who.pub);
    // a genesis names its own key: a replaced key is replaced in it too (remapValue reads pubmap)
    body = next(h.body);
    const prevBody = newBody.get(old);
    const id = hashOf(body, suiteOfId(old));
    let sig = h.o.signature;
    if (who && needsSig) sig = signWith(body, keyFor(who.pub));
    if (prevBody && canon(prevBody) === canon(body) && newSig.get(old) === sig) continue;
    newBody.set(old, body); newSig.set(old, sig);
    if (id !== old && idmap.get(old) !== id) { idmap.set(old, id); grew++; }
    else if (prevBody === undefined) grew++;
  }
  log(`pass ${pass}: ${grew} blocks moved`);
  if (!grew) break;
  if (pass > 30) throw new Error('re-signing does not settle');
}
report.resigned = newBody.size; report.ids = idmap.size;

// write each copy back: its new bytes and signature; a copy with other bytes or another signature (a forgery a case shows) keeps what it shows
const writeBack = (x) => {
  if (Array.isArray(x)) return x.forEach(writeBack);
  if (!isObj(x) || isStoryCase(x)) return;
  const body = typeof x.type === 'string' && isObj(x.state) && isObj(x.refs) ? x : isObj(x.block) && typeof x.hash === 'string' && typeof x.block.type === 'string' ? x.block : null;
  if (body) {
    const written = typeof x.hash === 'string' ? x.hash : null;
    const bytesId = hashOf(body, suiteOfId(written));
    const old = newBody.has(bytesId) ? bytesId : written && newBody.has(written) ? written : null;
    if (old) {
      const sameBytes = canon(body) === origCanon.get(old);
      const sameSig = !('signature' in x) || x.signature === origSig.get(old) || x.signature === newSig.get(old);
      // a copy signed by another key over the same bytes (a forgery a case shows) is signed again by that same key over the new bytes
      const who = !sameSig && sameBytes ? signerOf(origBody.get(old), x.signature) : null;
      const nb = sameBytes ? newBody.get(old) : next(body);
      body.type = nb.type; body.state = clone(nb.state); body.refs = clone(nb.refs);
      if ('signature' in x) {
        if (sameSig) x.signature = newSig.get(old);
        else if (who) x.signature = signWith(nb, keyFor(who.pub));
      }
      if (written && idmap.has(written)) x.hash = idmap.get(written);
      else if (written && written === old && idmap.has(old)) x.hash = idmap.get(old);
      return Object.entries(x).forEach(([k, v]) => { if (k !== 'state' && k !== 'refs' && k !== 'block') writeBack(v); });
    }
    if (!('hash' in x) && !('signature' in x)) { const n = next(body); body.type = n.type; body.state = n.state; body.refs = n.refs; }
  }
  for (const v of Object.values(x)) writeBack(v);
};
writeBack(V);

const commitmap = new Map([...commitOf.keys()].map((c) => [c, remapCommit(c)]).filter(([, n]) => n));
// then every old id, key or commitment anywhere: keys, text and names included
const fixStrings = (x) => {
  if (Array.isArray(x)) {
    const out = x.map(fixStrings);
    const wasSorted = x.length > 1 && x.every((y, i) => typeof y === 'string' && (i === 0 || x[i - 1] < y));
    return wasSorted ? out.sort() : out;
  }
  if (isObj(x)) return Object.fromEntries(Object.entries(x).map(([k, v]) => [idmap.get(k) || pubmap.get(k) || commitmap.get(k) || k, fixStrings(v)]));
  if (typeof x === 'string') return pubmap.has(x) ? pubmap.get(x) : commitmap.has(x) ? commitmap.get(x) : x.replace(/[0-9a-f]{64}/g, (m) => idmap.get(m) || commitmap.get(m) || m);
  return x;
};
const fixed = fixStrings(V);
for (const k of Object.keys(V)) delete V[k];
Object.assign(V, fixed);
// message parts outside blocks whose content moved are signed again by the key that signed them
{ const again = resignMessages(V); for (const k of Object.keys(V)) delete V[k]; Object.assign(V, again); }
if (commitmap.size) { /* a block whose audience changed changed its bytes: the fixed point above already re-signed blocks whose ids moved; commitments inside a block move its id */ }

// ============================================================ 4. sealed copies: the plaintext changes with its block; the content key stays
const EP = O.envelopeParts;
const openWith = (env) => {
  const s = EP.suiteOfAlg(env.alg); if (!s) return null;
  for (const [pub, k] of encBank) {
    try {
      const key = EP.envKey(s, EP.agree(s, k.priv, env.ephemeral_key), env.ephemeral_key, pub);
      for (const r of env.recipients || []) {
        const b = Buffer.from(r.encrypted_key, 'base64');
        if (b.length !== 60) continue;
        let ck; try { ck = EP.gcmOpen(s, key, b.subarray(48, 60), b.subarray(0, 32), b.subarray(32, 48)); } catch { continue; }
        return { s, ck };
      }
    } catch { /* not this key */ }
  }
  return null;
};
let resealed = 0;
const reseal = (x) => {
  if (Array.isArray(x)) return x.forEach(reseal);
  if (!isObj(x)) return;
  if (typeof x.alg === 'string' && typeof x.ciphertext === 'string' && typeof x.nonce === 'string' && Array.isArray(x.recipients)) {
    const k = openWith(x);
    if (k) {
      const c = Buffer.from(x.ciphertext, 'base64'), iv = Buffer.from(x.nonce, 'base64');
      let plain; try { plain = JSON.parse(EP.gcmOpen(k.s, k.ck, iv, c.subarray(0, c.length - 16), c.subarray(c.length - 16)).toString('utf8')); } catch { plain = null; }
      if (plain !== null) {
        const was = JSON.stringify(plain);
        const holder = [plain]; walkFix(holder);
        // a sealed copy { header, header_signature, envelope }: the header is the block's header, and its signature the block's (over that header)
        const parent = sealedParent.get(x);
        if (parent && isObj(holder[0].block)) {
          const b = holder[0].block, oldHeader = parent.header;
          const hash = hashOf(b, suiteOfId(oldHeader && oldHeader.hash));
          const hdr = O.header({ ...b, hash });
          const pub = headerSigner.get(parent.header_signature) || null;
          void oldHeader;
          const opensNow = (() => { try { return !!pub && O.verifyBytes(Buffer.from(O.jcs(hdr), 'utf8'), parent.header_signature, pub); } catch { return false; } })();
          if (pub && !(same(hdr, oldHeader) && opensNow && !pubmap.has(pub))) { const k = keyFor(pub); parent.header = hdr; parent.header_signature = O.signBlock(b, k.private_key, k.suite); }
        }
        if (JSON.stringify(holder[0]) !== was) {
          const body = EP.gcmSeal(k.s, k.ck, iv, Buffer.from(JSON.stringify(holder[0]), 'utf8'));
          x.ciphertext = Buffer.concat([body.ct, body.tag]).toString('base64'); resealed++;
        }
      }
    }
    return;
  }
  for (const v of Object.values(x)) reseal(v);
};
// the same moves as the file had, inside a plaintext
function walkFix(holder) {
  const before = holders.length;
  walk(holder);
  const mine = holders.splice(before);
  for (const h of mine) {
    const b = h.body;
    const id = typeof h.o.hash === 'string' ? h.o.hash : null;
    const old = id && newBody.has(id) ? id : newBody.has(hashOf(b)) ? hashOf(b) : null;
    if (old) { const nb = newBody.get(old); b.state = clone(nb.state); b.refs = clone(nb.refs); if ('signature' in h.o) h.o.signature = newSig.get(old); if (id) h.o.hash = idmap.get(old) || old; }
  }
  holder[0] = fixStrings(holder[0]);
}
// each envelope's sealed copy, if it is one; and each new id's old id (an author's pieces are named by the old id in pubsOf)
const sealedParent = new Map();
{ const w = (x) => { if (Array.isArray(x)) x.forEach(w); else if (isObj(x)) { if (isObj(x.envelope) && isObj(x.header) && typeof x.header_signature === 'string') sealedParent.set(x.envelope, x); Object.values(x).forEach(w); } }; w(V); }
const origOf = new Map([...idmap].map(([o, n]) => [n, o]));
reseal(V);
// a sealed copy's header is the block's header, signed by the block's key (the same bytes its signature covers)
const holderByNewId = new Map([...unique].map(([id, h]) => [idmap.get(id) || id, h]));
const oldIdOf = new Map([...unique].map(([id, h]) => [h, id]));
const fixHeaders = (x) => {
  if (Array.isArray(x)) return x.forEach(fixHeaders);
  if (!isObj(x)) return;
  if (isObj(x.header) && typeof x.header_signature === 'string' && typeof x.header.hash === 'string' && !isObj(x.envelope)) {
    const blockHolder = holderByNewId.get(x.header.hash);
    if (blockHolder) {
      const oldId = oldIdOf.get(blockHolder);
      const b = newBody.get(oldId) || blockHolder.body;
      const hdr = O.header({ ...b, hash: x.header.hash });
      const who = signerOf(origBody.get(oldId), origSig.get(oldId));
      const opensNow = (() => { try { return !!who && O.verifyBytes(Buffer.from(O.jcs(hdr), 'utf8'), x.header_signature, who.pub); } catch { return false; } })();
      if (who && !(same(hdr, x.header) && opensNow && !pubmap.has(who.pub))) { const k = keyFor(who.pub); x.header = hdr; x.header_signature = O.signBytes(Buffer.from(O.jcs(hdr), 'utf8'), k.private_key, k.suite); }
    }
  }
  for (const v of Object.values(x)) fixHeaders(v);
};
fixHeaders(V);
log(`${report.resigned} blocks re-signed or moved, ${report.ids} ids changed, ${report.rekeyed} keys nobody could name replaced, ${commitmap.size ? 'commitments followed' : 'no commitments moved'}, ${resealed} sealed copies sealed again`);

// cbor.loose is another well-formed encoding of a case's block, made by hand (keys out of order, a longer integer): its bytes carry the ids
// and the signature as byte strings, so each moves as it moved in the block (the same length, the same place)
if (V.cbor && V.cbor.loose && typeof V.cbor.loose.cbor === 'string') {
  let hex = V.cbor.loose.cbor;
  for (const [o, n] of idmap) if (!o.includes(':') && !n.includes(':')) hex = hex.split(o).join(n);
  for (const [old, sig] of newSig) { const was = origSig.get(old); if (typeof was === 'string' && typeof sig === 'string' && was.length === sig.length && was !== sig) hex = hex.split(was).join(sig); }
  V.cbor.loose.cbor = hex;
}
// ============================================================ 5. the cases
const DOORP = new Set([...P.door.protocol.sound, ...P.door.protocol.word]);
const CLASS = {};
for (const [c, list] of Object.entries(CONV.door.classes)) if (Array.isArray(list)) for (const op of list) CLASS[op] = c;
const classOf = (op) => (DOORP.has(op) ? 'protocol' : CLASS[op] || 'unclassed');
const ask = (fn) => { try { return { ok: fn() }; } catch (e) { return { err: { code: e.code, kind: e.kind, message: String(e.message) } }; } };
const askOracle = (c) => ask(() => (c.op === 'sign' ? O.door('sign', ...clone(c.args)) : O.door(c.op, ...clone(c.args))));
const askCore = (c) => ask(() => call(c.op, ...clone(c.args)));
const noOp = (r) => r.err && /has no op|no such op|unknown op|not an op|is not in this build|not a door op/i.test(r.err.message);
// a case reads an answer through its lens: an error's code, the codes of a refusal list, the answer exactly, or the keys the case names
const lensOf = (c) => (c.error ? 'error' : c.codes ? 'codes' : c.exact ? 'exact' : 'subset');
const subset = (got, want) => Array.isArray(want) ? Array.isArray(got) && got.length === want.length && want.every((v, i) => subset(got[i], v))
  : isObj(want) ? isObj(got) && Object.entries(want).every(([k, v]) => subset(got[k], v)) : same(got, want);
// the expectation an answer gives, in the shape the case already had: the keys it named (a key the answer no longer has leaves)
const project = (got, want) => {
  if (isObj(want) && isObj(got)) { const out = {}; for (const k of Object.keys(want)) if (k in got) out[k] = project(got[k], want[k]); return out; }
  if (Array.isArray(want) && Array.isArray(got) && got.length === want.length) return got.map((g, i) => project(g, want[i]));
  return got;
};
const errorOf = (r) => (r.err.code ? { code: r.err.code } : { kind: r.err.kind || 'argument' });
const errorMatches = (r, e) => r.err && (!e.code || r.err.code === e.code) && (!e.kind || r.err.kind === e.kind);
const blocksIn = (x, out = []) => { if (Array.isArray(x)) x.forEach((y) => blocksIn(y, out)); else if (isObj(x)) { if (typeof x.type === 'string' && isObj(x.state) && isObj(x.refs)) out.push(x); Object.values(x).forEach((y) => blocksIn(y, out)); } return out; };

// a refusal's `detail` (and an error's message) are each engine's own words: no lens reads them
// (and a `why` written as a sentence, as to_come_back and backed give it: a code has no space)
const words = (x) => (Array.isArray(x) ? x.map(words) : isObj(x) ? Object.fromEntries(Object.entries(x).filter(([k, v]) => !(k === 'detail' && 'code' in x) && !(k === 'why' && typeof v === 'string' && v.includes(' '))).map(([k, v]) => [k, words(v)])) : x);
const hadWords = (x) => J(words(x)) !== J(x);
// the lens a case reads its answer through, from the oracle's answer, and whether the core gives the same: { lens } or { fault }
function judgeCase(c, o, k) {
  const lens = lensOf(c);
  if (o.err) {
    if (!k.err || (o.err.code || null) !== (k.err.code || null) || (!o.err.code && (o.err.kind || 'argument') !== (k.err.kind || 'argument'))) return { fault: { oracle: o.err, core: k.err || k.ok } };
    return { lens: { error: errorOf(o) } };
  }
  if (k.err) return { fault: { oracle: o.ok, core: k.err } };
  const ow = words(o.ok), kw = words(k.ok);
  if (lens === 'codes' || (lens === 'error' && Array.isArray(o.ok) && o.ok.every((x) => isObj(x) && 'code' in x))) {
    if (!Array.isArray(o.ok)) return same(ow, kw) ? { lens: { expect: ow, exact: true } } : { fault: { oracle: ow, core: kw } };
    const codes = codesOf(o.ok);
    return same(codesOf(k.ok), codes) ? { lens: { codes } } : { fault: { oracle: codes, core: codesOf(k.ok) } };
  }
  if (lens === 'exact' || lens === 'error' || (!isObj(c.expect) && !Array.isArray(c.expect))) {
    if (!same(ow, kw)) return { fault: { oracle: ow, core: kw } };
    return { lens: hadWords(o.ok) ? { expect: ow } : { expect: ow, exact: true } };
  }
  let p = project(ow, c.expect), exact = false;
  if ((isObj(p) && !Object.keys(p).length) || (isObj(c.expect) && !isObj(ow)) || (Array.isArray(c.expect) && !Array.isArray(ow))) { p = ow; exact = !hadWords(o.ok); }
  if (!(exact ? same(kw, ow) : subset(kw, p))) return { fault: { oracle: p, core: kw } };
  return { lens: exact ? { expect: p, exact: true } : { expect: p } };
}
const STAGES = [
  ['records'], ['things'], ['keys'], ['payments'], ['grants'], ['deals'], ['circles'], ['privacy'], ['rules'],
];
// the questions the fixtures ask now: a story case they no longer ask (its story was written again) leaves, as the fixtures are its only source
const askedNow = new Set();
for (const [file] of STAGES) {
  const f = path.join(ROOT, 'sdk/rust/tests/fixtures', file + '.json');
  if (fs.existsSync(f)) for (const q of JSON.parse(fs.readFileSync(f, 'utf8')).questions) askedNow.add(q.op + '|' + J(q.args));
}
const keptCases = [];
const seen = new Set();
for (const c0 of V.door) {
  const c = { ...c0 };
  const from = c._from; delete c._from;
  const why = c._why; delete c._why;
  const name = c.name;
  if (c.story && !askedNow.has(c.op + '|' + J(c.args))) { report.deleted.push({ name, op: c.op, why: 'its story asks it no longer (the fixture was written again)' }); continue; }
  if (c.oracle === false) { // outside the spec text: kept as it was if the core still gives it
    const r = askCore(c);
    const ok = c.error ? errorMatches(r, c.error) : r.ok !== undefined && (c.codes ? same(codesOf(r.ok), c.codes) : c.exact ? same(r.ok, c.expect) : subset(r.ok, c.expect));
    if (ok) { keptCases.push(c); report.kept.push(name); } else report.faults.push({ name, op: c.op, oracle: 'outside the text', core: r });
    continue;
  }
  const o = askOracle(c), k = askCore(c);
  if ((noOp(o) && noOp(k)) || M.GONE[c.op]) { report.deleted.push({ name, op: from ? from.op : c.op, why: M.GONE[c.op] || M.GONE[from && from.op] || 'neither engine has this op' }); continue; }
  const r = judgeCase(c, o, k);
  if (r.fault) { report.faults.push({ name, op: c.op, oracle: r.fault.oracle, core: r.fault.core }); continue; }
  const was = clone(c0);
  Object.assign(c, r.lens);
  for (const x of ['expect', 'codes', 'exact', 'error']) if (!(x in r.lens)) delete c[x];
  const key = c.op + '|' + J(c.args);
  if (seen.has(key) && !c.name) continue;
  seen.add(key);
  const changed = from || !same({ e: was.expect, c: was.codes, x: !!was.exact, r: was.error }, { e: c.expect, c: c.codes, x: !!c.exact, r: c.error });
  if (changed) report.renewed.push({ name, op: c.op, why: why || M.renewReason(c.op) }); else report.kept.push(name);
  keptCases.push(c);
}

// ============================================================ 6. the stories of each subject, asked of both engines
// The oracle's stories (spec/oracle/stories/export.cjs) write each subject's door questions with the oracle's answers to
// sdk/rust/tests/fixtures/<subject>.json. Each question becomes a case: the oracle is asked again here, and the core must agree. A
// question about a mount (a fresh random id) or whose answer the oracle does not give twice alike (randomness) is not a vector.
const have = new Set(keptCases.map((c) => c.op + '|' + J(c.args)));
// a story case is named by its subject, its story and its question, as the fixtures stand now
const storyCase = new Map(keptCases.filter((c) => c.story).map((c) => [c.op + '|' + J(c.args), c]));
const count = {};
for (const [file] of STAGES) {
  const f = path.join(ROOT, 'sdk/rust/tests/fixtures', file + '.json');
  if (!fs.existsSync(f)) continue;
  const qs = JSON.parse(fs.readFileSync(f, 'utf8')).questions;
  // a mount is a fresh random id each time it is made: a question that names one reads what a mount given then, and is no vector
  const mountIds = new Set(qs.filter((q) => q.op === 'mount' && typeof q.answer === 'string').map((q) => q.answer));
  const place = new Map();
  for (const q of qs) {
    const n = (place.get(q.story) || 0) + 1;
    place.set(q.story, n);
    if ([...mountIds].some((m) => JSON.stringify(q.args).includes(m))) continue;
    if (['mount', 'unmount', 'keypair', 'new_salt', 'new_challenge', 'encryption_keypair'].includes(q.op)) continue;
    if (JSON.stringify(q.args).includes('"mount"') || (isObj(q.args[0]) && 'mount' in q.args[0])) continue;
    const key = q.op + '|' + J(q.args);
    if (have.has(key)) { const sc = storyCase.get(key); if (sc && !sc.named) { sc.name = `${file}: ${q.story}: ${q.op}, question ${n}`; sc.story = q.story; sc.named = true; } continue; }
    const c = { op: q.op, args: q.args };
    const o1 = askOracle(c), o2 = askOracle(c);
    if (!same(o1, o2)) continue;
    if (o1.err && noOp(o1)) continue;
    const k = askCore(c);
    c.name = `${file}: ${q.story}: ${q.op}, question ${n}`;
    c.story = q.story;
    const r = judgeCase({ exact: true }, o1, k);
    if (r.fault) { report.faults.push({ name: c.name, op: c.op, oracle: r.fault.oracle, core: r.fault.core }); continue; }
    Object.assign(c, r.lens);
    have.add(key);
    keptCases.push(c);
    report.added.push({ name: c.name, op: c.op });
  }
}

// ============================================================ 7. the sections of bytes, made again from their blocks
const byHash = new Map();
const recordBlocks = (x) => { for (const h of (() => { const hs = []; const w = (y) => { if (Array.isArray(y)) y.forEach(w); else if (isObj(y)) { if (isObj(y.block) && typeof y.hash === 'string') hs.push(y); Object.values(y).forEach(w); } }; w(x); return hs; })()) byHash.set(h.hash, h); };
recordBlocks(V);
const full = (b) => ({ hash: b.hash, ...b.block, ...(b.suite ? { suite: b.suite } : {}), signature: b.signature });
const sectionFault = (name, what) => report.faults.push({ name, op: 'section', oracle: what });
for (const v of V.canonical || []) { v.canonical = O.canonOf(v.block); v.hash = O.hashOfBlock(v.block, 'std'); if (call('canonical', v.block.type, v.block.state, v.block.refs) !== v.canonical) sectionFault(`canonical: ${v.name}`, 'the core writes other bytes'); }
{
  const before = [];
  for (const v of [...V.ledger.genesis, ...V.hashes]) {
    if (v.canonical) v.canonical = O.canonOf(v.block);
    const b = full(v);
    const wrong = O.valid(b, before);
    if (wrong.length || call('valid', b, before).length) sectionFault(`ledger: ${v.name}`, codesOf(wrong));
    before.push(b);
  }
}
for (const v of V.audience || []) v.commitment = O.saltedHash(v.salt, v.recipient, 'std');
for (const v of V.signatures || []) { const b = byHash.get(v.hash); if (b) v.signature = b.signature; }
for (const v of V.headers || []) {
  const b = byHash.get(v.hash); if (!b) { sectionFault(`header: ${v.name}`, 'its block is gone'); continue; }
  v.header = O.header({ hash: b.hash, ...b.block });
  const k = bank.get(V.keys[v.signer].public_key_sign);
  v.header_signature = O.signBytes(Buffer.from(O.jcs(v.header), 'utf8'), k.private_key, k.suite);
  if (!same(call('header', full(b)), v.header)) sectionFault(`header: ${v.name}`, 'the core gives another header');
}
for (const v of [...(V.envelopes || []), ...((V.sealed || {}).cases || [])]) {
  try {
    const priv = V.keys[v.recipient].x25519_private || V.keys[v.recipient].xwing_private; // an X-Wing recipient's private seed
    const m = v.envelope ? O.unwrap(O.open(v.envelope, priv)) : O.openCopy(v.message, priv);
    v.opens_to = { hash: m.hash, signature: m.signature, ...(v.opens_to && 'reveals' in v.opens_to ? { reveals: m.reveals } : {}) };
  } catch (e) { sectionFault(`sealed: ${v.name}`, e.message); }
}
if (V.messages) {
  const MS = V.messages;
  const node = bank.get(V.keys[MS.node_signer].public_key_sign);
  const resignPart = (m, signer) => { const k = bank.get(V.keys[signer].public_key_sign); return O.signMessage(m, k.private_key, k.suite); };
  for (const [part, signerOf_] of [['signed_pull', (x) => x.signer], ['signed_pull_challenge', (x) => x.signer], ['signed_push', (x) => x.signer], ['pull_answer', () => MS.node_signer], ['push_answer', () => MS.node_signer]]) {
    const x = MS[part]; if (!isObj(x) || !isObj(x.message)) continue;
    const signer = typeof signerOf_(x) === 'string' && V.keys[signerOf_(x)] ? signerOf_(x) : MS.node_signer;
    x.message = resignPart(x.message, signer);
  }
  // the push answer in the current shape (unjudged, unread), rebuilt by the oracle's node and checked against the core's
  if (isObj(MS.push_answer) && isObj(MS.push_answer.message)) {
    const m = MS.push_answer.message, priv = V.keys[MS.node_signer].private_key;
    const re = O.door('push_answer', { ...m, ...(m.waiting !== undefined && m.unjudged === undefined ? { unjudged: m.waiting } : {}) }, m.node, priv);
    delete re.waiting;
    const again = O.door('push_answer', re, m.node, priv);
    if (!same(call('push_answer', re, m.node, priv), again)) sectionFault('message: push answer', 'the core rebuilds it otherwise');
    MS.push_answer.message = again;
  }
  void node;
  MS.announcement = O.announcement(MS.discovery);
  if (O.wellKnownErrors(MS.discovery).length || call('well_known_errors', MS.discovery).length) sectionFault('message: discovery', O.wellKnownErrors(MS.discovery));
}
if (V.cbor) {
  const fromHex = (h) => Buffer.from(h, 'hex');
  for (const c of V.cbor.cases) {
    const b = byHash.get(c.hash);
    if (b && b.signature !== c.signature && same(b.block, c.block)) c.signature = b.signature;
    const block = { hash: c.hash, ...c.block, signature: c.signature };
    c.cbor = O.cborEncode(block, false).toString('hex'); c.cbor_short = O.cborEncode(block, true).toString('hex');
    c.canonical_bytes = Buffer.byteLength(O.canonOf(c.block));
    if (call('cbor_encode', block, false) !== c.cbor || call('cbor_encode', block, true) !== c.cbor_short) sectionFault(`cbor: ${c.name}`, 'the core writes other bytes');
  }
  const pushBlocks = V.cbor.push.hashes.map((h) => V.cbor.cases.find((c) => c.hash === h)).map((c) => ({ hash: c.hash, ...c.block, signature: c.signature }));
  V.cbor.push.cbor = O.cborEncodePush(pushBlocks, false).toString('hex'); V.cbor.push.cbor_short = O.cborEncodePush(pushBlocks, true).toString('hex');
  for (const h of V.cbor.headers) { h.cbor = O.cborHeader(h.header, false).toString('hex'); h.cbor_short = O.cborHeader(h.header, true).toString('hex'); }
  void fromHex;
}

// ============================================================ 7b. a refused check is protocol evidence: each writer's case is asked of `read`
// A case of `write_refusals` (a draft's refusals, a library op) shows what the protocol's closed lists and grammar refuse. The same check is
// `read`'s (core.md, section 8, check 7), a protocol op: each such case is moved there, its draft signed as a block of one fixed test
// identity (the reader of refused checks), the next block of her line, its other blocks given beside her genesis. A case whose block would
// not be valid (a draft the valid check already turns away: too deep, a number out of range) stays the writer's case.
{
  const P = JSON.parse(fs.readFileSync(path.join(ROOT, 'spec', 'protocol.json'), 'utf8'));
  const READER_SEED = sha('foodblock vectors: the reader of refused checks');
  const rk = O.keypair(READER_SEED, 'std');
  if (!bank.has(rk.public_key_sign)) bank.set(rk.public_key_sign, { private_key: rk.private_key, suite: 'std' });
  const genBody = { type: 'actor', state: { kind: 'person', public_key_sign: rk.public_key_sign, at: '2026-10-15T12:00:00.000Z', audience: 'public' }, refs: {} };
  const G = { hash: O.hashOfBlock(genBody, 'std'), ...genBody, signature: O.signBlock(genBody, rk.private_key, 'std') };
  let moved = 0, stayed = 0;
  for (let i = 0; i < keptCases.length; i++) {
    const c = keptCases[i];
    if (c.op !== 'write_refusals' || c.story) continue;
    const dr = c.args[0];
    if (!isObj(dr) || !isObj(dr.refs) || dr.refs.author === undefined || !isObj(dr.state)) { stayed++; continue; }
    // a case keeps its own ids where its ids are what it tests: a set in a single-id ref stays a set (of the reader's own id where it was
    // author, prev or key, so it is still signed by her); a set in author, prev or key makes no valid block, so it is asked of `valid`
    const tested = (P.refs_single || []).filter((k) => Array.isArray(dr.refs[k]));
    const chainSet = tested.some((k) => ['author', 'prev', 'key'].includes(k));
    const refs = { ...dr.refs, author: tested.includes('author') ? [G.hash] : G.hash, prev: tested.includes('prev') ? [G.hash] : G.hash };
    if (tested.includes('key')) refs.key = [G.hash];
    const body = { type: dr.type, state: { ...dr.state, seq: 1 }, refs };
    const block = { hash: O.hashOfBlock(body, 'std'), ...body, signature: O.signBlock(body, rk.private_key, 'std') };
    const rc = { name: c.name, op: chainSet ? 'valid' : 'read', args: [block, [G, ...(Array.isArray(c.args[1]) ? c.args[1] : [])]], codes: [] };
    const o = askOracle(rc), k = askCore(rc);
    if (o.err || k.err) { stayed++; continue; }
    const r = judgeCase(rc, o, k);
    if (r.fault) { report.faults.push({ name: 'read: ' + c.name, op: 'read', oracle: r.fault.oracle, core: r.fault.core }); continue; }
    const out = { name: c.name, op: rc.op, args: rc.args, ...r.lens };
    if (Array.isArray(c.invariants)) out.invariants = c.invariants;
    keptCases[i] = out;
    moved++;
    // (the block as an earlier run read it, its author and prev the reader's own, stays a case beside it: a case once measured is never
    // taken away, so a later partial measure stays sound; necessity.cjs --only)
    if (chainSet) {
      const pb = { type: dr.type, state: { ...dr.state, seq: 1 }, refs: { ...dr.refs, author: G.hash, prev: G.hash } };
      if (tested.includes('key')) pb.refs.key = dr.refs.key;
      const plain = { hash: O.hashOfBlock(pb, 'std'), ...pb, signature: O.signBlock(pb, rk.private_key, 'std') };
      const pc = { name: c.name + ' (its other refs, read as a block of the reader)', op: 'read', args: [plain, rc.args[1]], codes: [] };
      const po = askOracle(pc), pk = askCore(pc);
      if (!po.err && !pk.err) { const pr = judgeCase(pc, po, pk); if (pr.fault) report.faults.push({ name: pc.name, op: 'read', oracle: pr.fault.oracle, core: pr.fault.core }); else keptCases.push({ name: pc.name, op: 'read', args: pc.args, ...pr.lens }); }
    }
  }
  log(`refused checks: ${moved} moved to read, ${stayed} stay the writer's`);
  // each single-id ref has one case that holds a set in it (core.md, section 1: it holds one id): where none came from the old file, one is
  // made, a block of the reader's line with that ref a set; asked of `read`, or of `valid` where a set there makes no valid block
  const prior = mk => ({ hash: O.hashOfBlock(mk, 'std'), ...mk, signature: O.signBlock(mk, rk.private_key, 'std') });
  const note = prior({ type: 'observe', state: { kind: 'note', at: '2026-10-15T12:01:00.000Z', audience: 'public', seq: 1 }, refs: { author: G.hash, prev: G.hash } });
  const hasSet = (k) => keptCases.some((c) => ['read', 'valid'].includes(c.op) && isObj(c.args[0]) && isObj(c.args[0].refs) && Array.isArray(c.args[0].refs[k]));
  let made = 0;
  for (const k of P.refs_single || []) {
    if (hasSet(k)) continue;
    const base = k === 'meter' ? { type: 'grant', state: { kind: 'tool', scope: { types: ['observe'] }, at: '2026-10-15T12:02:00.000Z', audience: 'public', seq: 2 }, refs: { author: G.hash, prev: note.hash, to: G.hash } }
      : k === 'to_owner' ? { type: 'transfer', state: { amount: { value: '1', unit: 'GBP' }, at: '2026-10-15T12:02:00.000Z', audience: 'public', seq: 2 }, refs: { author: G.hash, prev: note.hash } }
      : { type: 'observe', state: { kind: 'note', ...(k === 'answers' ? { status: 'declined' } : {}), at: '2026-10-15T12:02:00.000Z', audience: 'public', seq: 2 }, refs: { author: G.hash, prev: note.hash } };
    base.refs[k] = [k === 'prev' || k === 'answers' || k === 'updates' ? note.hash : G.hash];
    const block = prior(base);
    const blocks = [G, note];
    const name = `a set of ids in refs.${k} is refused: ${k} holds one id (core.md, section 1)`;
    let rc = { name, op: 'read', args: [block, blocks], codes: [] };
    let o = askOracle(rc), kk = askCore(rc);
    if (o.err && kk.err) { rc = { ...rc, op: 'valid' }; o = askOracle(rc); kk = askCore(rc); }
    const r = judgeCase(rc, o, kk);
    if (r.fault) { report.faults.push({ name, op: rc.op, oracle: r.fault.oracle, core: r.fault.core }); continue; }
    keptCases.push({ name, op: rc.op, args: rc.args, ...r.lens });
    report.added.push({ name, op: rc.op });
    made++;
  }
  log(`single-id refs: ${made} set cases made`);
}

// ============================================================ 8. write
M.tagInvariants(keptCases);
for (const c of keptCases) delete c.named;
delete V.invariant_numbers; // the invariants have one numbering, core.md section 9
const protocolCases = keptCases.filter((c) => classOf(c.op) === 'protocol');
const otherCases = keptCases.filter((c) => classOf(c.op) !== 'protocol').map((c) => ({ class: classOf(c.op), ...c }));
report.counts = { kept: report.kept.length, renewed: report.renewed.length, deleted: report.deleted.length, added: report.added.length, faults: report.faults.length, protocol: protocolCases.length, conventions: otherCases.length };
log(JSON.stringify(report.counts));
fs.mkdirSync(path.dirname(LOG), { recursive: true });
fs.writeFileSync(LOG, JSON.stringify({ ...report, kept: report.kept.length }, null, 1) + '\n');
if (report.faults.length) {
  log(`${report.faults.length} faults: nothing written (tools/vectors/last-run.json lists them)`);
  for (const f of report.faults.slice(0, 40)) log(`  ${f.op}: ${f.name}`);
  process.exit(1);
}
if (DRY) process.exit(0);
V.$comment = 'FoodBlock conformance vectors: the cases of the sound part and of the word ops (core.md, section 12; protocol.json door.protocol). Written by tools/vectors.cjs from both engines: each answer is the oracle\'s (spec/oracle, written from the text alone), and the Rust core gives the same; never edit by hand. Test keys come from fixed seeds (tools/vectors/keys.json holds every test key that signs here): never use them for anything real. Sections: keys; canonical; hashes (one block of every type) and ledger (its genesis blocks); audience; signatures; bad_signatures; envelopes; sealed; headers; messages; cbor (the key table is conventions.json cbor.keys); door (an op, its arguments, and its answer: `expect` is a subset match unless `exact`, `codes` the refusal codes, `error` a failure; `invariants` the invariants\' numbers, 07-last.md E1). The cases of readings, library tools and a node\'s own business are in conventions-vectors.json.';
V.door = protocolCases;
const order = ['$comment', 'keys', 'canonical', 'hashes', 'ledger', 'audience', 'signatures', 'bad_signatures', 'envelopes', 'sealed', 'headers', 'messages', 'cbor', 'door'];
const outV = Object.fromEntries([...order.filter((k) => k in V), ...Object.keys(V).filter((k) => !order.includes(k))].map((k) => [k, V[k]]));
fs.writeFileSync(FILE, JSON.stringify(outV, null, 1) + '\n');
fs.writeFileSync(CFILE, JSON.stringify({ $comment: 'The cases of every door op outside the protocol (conventions.json door.classes: readings, library tools, a node\'s own business), written by tools/vectors.cjs beside spec/vectors.json, from both engines. Nobody must run them to speak FoodBlock (core.md, section 12). Same shape as vectors.json\'s door section, with each case\'s class.', door: otherCases }, null, 1) + '\n');
const used = {};
for (const [pub, k] of bank) if (allPubs.has(pub) || [...pubmap.values()].includes(pub)) used[pub] = k;
fs.writeFileSync(KEYS, JSON.stringify(sortKeys(used), null, 1) + '\n');
log('written');
