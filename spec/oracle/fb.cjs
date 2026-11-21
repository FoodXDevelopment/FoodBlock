'use strict';
// FoodBlock 1.8 (stages 1 and 2: keys, the store) conformance oracle, written from the spec TEXT only (core.md, canonical.md, protocol.md, transport.md,
// protocol.json, modules/*.md, profiles/*.md). Plain Node, built-in crypto, no dependency.
// Where the text is silent a reading is marked GUESS. Where a primitive is not in Node (SM2, SM4-GCM) it is built by hand.
// 1.9 3d-16 (D9; stage 5): a will holds nothing in life and the successor profile is gone: her close is a key grant that leaves no voice (3d-15), and a will is her own transfer on `{ closed: <her id> }`
const crypto = require('crypto');
const SUITES = ['std', 'p256', 'sm'];
const SPEC = require('path').join(__dirname, '..') + '/';
// how deep a reader reads what carries a block and the chain of places a thing is in (protocol.json limits.read_depth; encoding.md, Limits)
const READ_DEPTH = require(require('path').join(__dirname, '..') + '/protocol.json').limits.read_depth;
// protocol.json, read as it is (1.9: it carries every stage's words; the oracle patches nothing at load)
const P = JSON.parse(require('fs').readFileSync(SPEC + 'protocol.json', 'utf8'));
// conventions.json: a node's conventions and the lists of readings and tools (envelope, messages, cbor, profiles, the other ops' door entries); no word reads it
const C = JSON.parse(require('fs').readFileSync(SPEC + 'conventions.json', 'utf8'));
// 1.9 stage 4 (grants): protocol.json carries stage 4's words (scope, set_places, fallbacks, shapes.list, refs.meter, state.draws, the door ops)
const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const isStr = x => typeof x === 'string';
const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
const byHash = (a, b) => cmp(a.hash, b.hash);
// 1.9 3a-6: strings compared by the bytes of their UTF-8 (a shorter before a longer it begins)
const byBytes = (a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
// a time as milliseconds, or null when it is no time; a block's own date; a grant's scope.until
const timeMs = s => (isStr(s) && !isNaN(Date.parse(s)) ? Date.parse(s) : null);
const termsOf = b => (isObj(b.state.terms) ? b.state.terms : {}); // a promise's terms, read as an object
const atMs = b => timeMs(b.state && b.state.at);
const untilMs = g => (isObj(g.state.scope) ? timeMs(g.state.scope.until) : null);
// ranOut(grant, block): the grant's scope.until has come by the block's own date (decision H11), a cut there. Silence may only narrow, never widen: a
// block with no date is cut too. (A block under a grant, decision D14, is the other reading: grantLive keeps a dateless block.)
const ranOut = (grant, block) => { const u = untilMs(grant); return u !== null && (atMs(block) === null || u <= atMs(block)); };
// whether a block is dated at or after `since` (null: any block); a block with no date is not
const datedFrom = (b, since) => since === null || (atMs(b) !== null && atMs(b) >= since);
// the fields that hold each shape (protocol.json field_shape): time, date, duration, or exactly one keyed shape
const fieldsOf = shape => Object.keys(P.field_shape).filter(k => P.field_shape[k] === shape);
const TIME_FIELDS = fieldsOf('time'), DATE_FIELDS = fieldsOf('date'), DURATION_FIELDS = fieldsOf('duration'), BARE_FIELDS = fieldsOf('shape').filter(f => !['voices', 'clocks'].includes(f)); // voices and clocks are read by voicesFindings and clocksOf

// ================================================================ canonical form (canonical.md)
// RFC 8785 (JCS). Writing never sorts sets or drops anything: strict writing is a CHECK (below), not a repair.
function jcs(v) {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Object.is(v, -0) ? '0' : String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(jcs).join(',') + ']';
  // 1.9 CORE-SET 3a-6: members in ascending order of the UTF-8 bytes of their keys' characters (never of UTF-16 units or escapes)
  if (typeof v === 'object') return '{' + Object.keys(v).sort(byBytes).filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + jcs(v[k])).join(',') + '}';
  throw new Error('not JSON');
}
const canonical = (type, state, refs) => jcs({ type, state, refs });
const canonOf = b => canonical(b.type, b.state, b.refs);

// ================================================================ hashes and suites (core.md section 2)
const cryptoError = (msg, code) => { const e = new Error(msg); e.kind = 'crypto'; if (code) e.code = code; return e; };
const suiteOf = name => { const s = name === undefined || name === null ? 'std' : name; if (!SUITES.includes(s)) throw cryptoError('unknown suite ' + s, 'unknown_suite'); return s; };
const hashName = suite => ({ std: 'sha256', p256: 'sha256', sm: 'sm3' })[suiteOf(suite)];
function hashBytes(suite, bytes) {
  const n = hashName(suite);
  const h = crypto.createHash(n).update(bytes).digest('hex');
  return n === 'sha256' ? h : n + ':' + h;
}
const hashStr = (suite, s) => hashBytes(suite, Buffer.from(s, 'utf8'));
const hashOfBlock = (b, suite) => hashStr(suite, canonOf(b));
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');

// A commitment (privacy.md): the suite hash of the salt's hex followed by the value, as UTF-8; a non-string is written as canonical JSON.
const saltedHash = (salt, value, suite) => hashStr(suite || 'std', salt + (typeof value === 'string' ? value : jcs(value)));
// The short code (profiles/short-form.md): the first 5 bytes of a block's id (the digest bytes) in Crockford Base32, as XXXX-XXXX.
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function crockfordOf(id, chars) {
  const hex = id.replace(/^[a-z0-9-]+:/, '');
  let bits = '';
  for (const c of hex) bits += parseInt(c, 16).toString(2).padStart(4, '0');
  let s = '';
  for (let i = 0; i < chars && (i + 1) * 5 <= bits.length; i++) s += CROCKFORD[parseInt(bits.slice(i * 5, i * 5 + 5), 2)];
  return s;
}
function shortCode(id) {
  const s = crockfordOf(id, 8);
  return s.slice(0, 4) + '-' + s.slice(4);
}
// A typed code names a block (short-form.md): case-insensitive, spaces and hyphens ignored, O is 0, I and L are 1; the first 8 characters are the short code, and more
// characters of the id (five bits at a time) name it further.
function codeMatches(text, id) {
  const typed = String(text).replace(/[\s-]/g, '').toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1');
  if (typed.length < 8) return false;
  return crockfordOf(id, typed.length) === typed;
}

// ================================================================ SM2 / SM4-GCM built by hand (GM/T 0003, 0004, 0002)
const B = BigInt;
const SM2 = {
  p: B('0xFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000FFFFFFFFFFFFFFFF'),
  a: B('0xFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000FFFFFFFFFFFFFFFC'),
  b: B('0x28E9FA9E9D9F5E344D5A9E4BCF6509A7F39789F515AB8F92DDBCBD414D940E93'),
  n: B('0xFFFFFFFEFFFFFFFFFFFFFFFFFFFFFFFF7203DF6B21C6052B53BBF40939D54123'),
  gx: B('0x32C4AE2C1F1981195F9904466A39C9948FE30BBFF2660BE1715A4589334C74C7'),
  gy: B('0xBC3736A2F4F6779C59BDCEE36B692153D0A9877CC62A474002DF32E52139F0A0'),
};
// NIST P-256 (FIPS 186-4, D.1.2.3), for the p256 suite's ECDSA written here so its nonce is the spec's (RFC 6979), not the platform's
const P256 = {
  p: B('0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFF'),
  a: B('0xFFFFFFFF00000001000000000000000000000000FFFFFFFFFFFFFFFFFFFFFFFC'),
  b: B('0x5AC635D8AA3A93E7B3EBBD55769886BC651D06B0CC53B0F63BCE3C3E27D2604B'),
  n: B('0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551'),
  gx: B('0x6B17D1F2E12C4247F8BCE6E563A440F277037D812DEB33A0F4A13945D898C296'),
  gy: B('0x4FE342E2FE1A7F9B8EE7EB4A7C0F9E162BCE33576B315ECECBB6406837BF51F5'),
};
const mod = (x, m) => ((x % m) + m) % m;
function inv(x, m) { let [a, b, u, v] = [mod(x, m), m, 1n, 0n]; while (b) { const q = a / b;[a, b] = [b, a - q * b];[u, v] = [v, u - q * v]; } return mod(u, m); }
const ecAdd = (P1, P2, C = SM2) => {
  const { p, a } = C;
  if (!P1) return P2; if (!P2) return P1;
  if (P1[0] === P2[0] && mod(P1[1] + P2[1], p) === 0n) return null;
  const l = P1[0] === P2[0] ? mod((3n * P1[0] * P1[0] + a) * inv(2n * P1[1], p), p) : mod((P2[1] - P1[1]) * inv(P2[0] - P1[0], p), p);
  const x = mod(l * l - P1[0] - P2[0], p);
  return [x, mod(l * (P1[0] - x) - P1[1], p)];
};
function ecMul(k, Pt, C = SM2) { let R = null, Q = Pt; while (k > 0n) { if (k & 1n) R = ecAdd(R, Q, C); Q = ecAdd(Q, Q, C); k >>= 1n; } return R; }
const G = [SM2.gx, SM2.gy];
// RFC 6979 section 3.2 (modules/encoding.md): the nonces, one after another, from HMAC over the hash (sha256 for p256, sm3 for sm), the private
// scalar d and h1 (here always 32 bytes, the order 256 bits, so bits2int is the plain integer), no extra data. Yields each k in 1 to n-1.
function* rfc6979(hashName, d, h1, n) {
  const hmac = (key, ...parts) => crypto.createHmac(hashName, key).update(Buffer.concat(parts)).digest();
  const x = Buffer.from(be(d), 'hex'), h = Buffer.from(be(mod(fromHex(h1.toString('hex')), n)), 'hex');
  let V = Buffer.alloc(32, 1), K = Buffer.alloc(32, 0);
  K = hmac(K, V, Buffer.from([0]), x, h); V = hmac(K, V);
  K = hmac(K, V, Buffer.from([1]), x, h); V = hmac(K, V);
  for (;;) {
    V = hmac(K, V);
    const k = fromHex(V.toString('hex'));
    if (k >= 1n && k < n) yield k;
    K = hmac(K, V, Buffer.from([0])); V = hmac(K, V);
  }
}
// ECDSA P-256 with SHA-256 and the RFC 6979 nonce; s reduced to its low half (core.md, Suites)
function p256Sign(msg, dHex) {
  const d = fromHex(dHex), h1 = crypto.createHash('sha256').update(msg).digest(), e = fromHex(h1.toString('hex')), n = P256.n;
  for (const k of rfc6979('sha256', d, h1, n)) {
    const R = ecMul(k, [P256.gx, P256.gy], P256), r = mod(R[0], n);
    if (r === 0n) continue;
    let s = mod(inv(k, n) * (e + r * d), n);
    if (s === 0n) continue;
    if (s > n / 2n) s = n - s;
    return be(r) + be(s);
  }
}
const be = (x, n = 32) => x.toString(16).padStart(n * 2, '0');
const fromHex = h => B('0x' + (h || '0'));
function sm2Z(pubPoint, id = '1234567812345678') {
  const idb = Buffer.from(id, 'utf8'), entl = Buffer.alloc(2); entl.writeUInt16BE(idb.length * 8);
  const parts = [entl, idb, ...[SM2.a, SM2.b, SM2.gx, SM2.gy, pubPoint[0], pubPoint[1]].map(x => Buffer.from(be(x), 'hex'))];
  return crypto.createHash('sm3').update(Buffer.concat(parts)).digest();
}
const sm2E = (pubPoint, msg) => fromHex(crypto.createHash('sm3').update(Buffer.concat([sm2Z(pubPoint), msg])).digest('hex'));
function sm2PubFromPriv(dHex) { const P_ = ecMul(fromHex(dHex), G); return '04' + be(P_[0]) + be(P_[1]); }
function sm2Sign(msg, dHex) {
  const d = fromHex(dHex), Pt = ecMul(d, G), e = sm2E(Pt, msg);
  // the nonce: RFC 6979 with HMAC-SM3, d and h1 = the 32 bytes of e; a pair with r = 0, r + k = n or s = 0 takes the next k (modules/encoding.md)
  for (const k of rfc6979('sm3', d, Buffer.from(be(e), 'hex'), SM2.n)) {
    const [x1] = ecMul(k, G), r = mod(e + x1, SM2.n);
    if (r === 0n || r + k === SM2.n) continue;
    const s = mod(inv(1n + d, SM2.n) * (k - r * d), SM2.n);
    if (s === 0n) continue;
    return be(r) + be(s);
  }
}
function sm2Verify(msg, pubHex65, sigHex) {
  try {
    if (!/^[0-9a-f]{128}$/.test(sigHex) || !/^04[0-9a-f]{128}$/.test(pubHex65)) return false;
    const r = fromHex(sigHex.slice(0, 64)), s = fromHex(sigHex.slice(64));
    const Pt = [fromHex(pubHex65.slice(2, 66)), fromHex(pubHex65.slice(66))];
    if (r < 1n || r >= SM2.n || s < 1n || s >= SM2.n) return false;
    if (mod(Pt[1] * Pt[1] - (Pt[0] ** 3n + SM2.a * Pt[0] + SM2.b), SM2.p) !== 0n) return false;
    const e = sm2E(Pt, msg), t = mod(r + s, SM2.n);
    if (t === 0n) return false;
    const X = ecAdd(ecMul(s, G), ecMul(t, Pt));
    return !!X && mod(e + X[0], SM2.n) === r;
  } catch { return false; }
}
// SM4-GCM: the SM4 block cipher from Node (ECB, one block at a time); CTR and GHASH are written here (NIST SP 800-38D).
const sm4ecb = (key, block) => { const c = crypto.createCipheriv('sm4-ecb', key, null); c.setAutoPadding(false); return Buffer.concat([c.update(block), c.final()]); };
const R128 = B('0xe1') << 120n;
function gmul(x, y) { let z = 0n, v = y; for (let i = 127; i >= 0; i--) { if ((x >> B(i)) & 1n) z ^= v; v = (v & 1n) ? (v >> 1n) ^ R128 : v >> 1n; } return z; }
function ghash(H, aad, ct) {
  const pad = b => b.length % 16 ? Buffer.concat([b, Buffer.alloc(16 - b.length % 16)]) : b;
  const len = Buffer.alloc(16); len.writeBigUInt64BE(B(aad.length * 8), 0); len.writeBigUInt64BE(B(ct.length * 8), 8);
  const data = Buffer.concat([pad(aad), pad(ct), len]);
  let y = 0n;
  for (let i = 0; i < data.length; i += 16) y = gmul(y ^ fromHex(data.subarray(i, i + 16).toString('hex')), H);
  return y;
}
function sm4gcm(key, iv, input, decrypt, tagIn) {
  const H = fromHex(sm4ecb(key, Buffer.alloc(16)).toString('hex'));
  const j0 = Buffer.concat([iv, Buffer.from([0, 0, 0, 1])]);
  const out = Buffer.alloc(input.length);
  let ctr = Buffer.from(j0);
  for (let i = 0; i < input.length; i += 16) {
    ctr = Buffer.from(ctr); ctr.writeUInt32BE((ctr.readUInt32BE(12) + 1) >>> 0, 12);
    const ks = sm4ecb(key, ctr);
    for (let j = 0; j < 16 && i + j < input.length; j++) out[i + j] = input[i + j] ^ ks[j];
  }
  const ct = decrypt ? input : out;
  const tag = Buffer.from(be(ghash(H, Buffer.alloc(0), ct) ^ fromHex(sm4ecb(key, j0).toString('hex')), 16), 'hex');
  if (decrypt && !crypto.timingSafeEqual(tag, tagIn)) throw cryptoError('authentication failed');
  return { out, tag };
}

// ================================================================ keys, signatures (core.md section 2)
const SPKI_PREFIX = { std: P.suites.std.sign_key.spki_prefix, p256: P.suites.p256.sign_key.spki_prefix, sm: P.suites.sm.sign_key.spki_prefix };
// 1.9 3a-10: a `p256` key's point is written uncompressed, with first byte `04`; any other spelling is no key
// 1.9 3a-10: a p256 key's point is written uncompressed, first byte 04 (protocol.json suites.p256.sign_key.grammar)
const keyGrammar = s => new RegExp(P.suites[s].sign_key.grammar);
const encGrammar = s => new RegExp(P.suites[s].encrypt_key.grammar);
const sigGrammar = s => new RegExp(P.suites[s].signature.grammar);
const passkeyGrammar = () => new RegExp(P.suites.p256.signature.passkey.grammar);
// The suite a signing key (SPKI hex) belongs to, by its grammar. null when none.
function suiteOfKey(spki) { for (const s of SUITES) if (typeof spki === 'string' && keyGrammar(s).test(spki)) return s; return null; }
const rawPoint = spki => spki.slice(SPKI_PREFIX.p256.length);
function keypair(seedHex, suite) {
  const s = suiteOf(suite);
  if (s === 'std') {
    const pk = crypto.createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.from(seedHex, 'hex')]), format: 'der', type: 'pkcs8' });
    const pub = crypto.createPublicKey(pk).export({ format: 'der', type: 'spki' }).toString('hex');
    return { public_key_sign: pub, private_key: pk.export({ format: 'der', type: 'pkcs8' }).toString('hex'), suite: 'std' };
  }
  if (s === 'p256') { const e = crypto.createECDH('prime256v1'); e.setPrivateKey(Buffer.from(seedHex, 'hex')); return { public_key_sign: SPKI_PREFIX.p256 + e.getPublicKey('hex'), private_key: seedHex, suite: 'p256' }; }
  return { public_key_sign: SPKI_PREFIX.sm + sm2PubFromPriv(seedHex), private_key: seedHex, suite: 'sm' };
}
function signBytes(bytes, privHex, suite) {
  const s = suiteOf(suite);
  if (s === 'std') return crypto.sign(null, bytes, crypto.createPrivateKey({ key: Buffer.from(privHex, 'hex'), format: 'der', type: 'pkcs8' })).toString('hex');
  if (s === 'p256') return p256Sign(bytes, privHex);
  return sm2Sign(bytes, privHex);
}
// ---- Ed25519 as the suite accepts it (core.md, Suites): a point is encoded canonically (y below p, and no sign bit on x = 0) and is not
// of small order ([8]P is not the identity); S is below the group order; the equation is cofactorless and checked on R's encoding
const EP = 2n ** 255n - 19n, EL = 2n ** 252n + 27742317777372353535851937790883648493n;
const edPow = (b, e) => { let r = 1n; b = mod(b, EP); while (e > 0n) { if (e & 1n) r = r * b % EP; b = b * b % EP; e >>= 1n; } return r; };
const ED = mod(-121665n * inv(121666n, EP), EP), EI = edPow(2n, (EP - 1n) / 4n);
function edDecode(buf) {
  if (buf.length !== 32) return null;
  const bytes = Buffer.from(buf), sign = bytes[31] >> 7; bytes[31] &= 0x7f;
  const y = BigInt('0x' + Buffer.from(bytes).reverse().toString('hex'));
  if (y >= EP) return null;
  const u = mod(y * y - 1n, EP), v = mod(ED * y * y + 1n, EP);
  let x = mod(u * edPow(v, 3n) * edPow(u * edPow(v, 7n), (EP - 5n) / 8n), EP);
  if (mod(v * x * x, EP) !== u) { if (mod(v * x * x, EP) === mod(-u, EP)) x = x * EI % EP; else return null; }
  if (x === 0n && sign === 1) return null;
  if (Number(x & 1n) !== sign) x = mod(-x, EP);
  return [x, y];
}
const edAdd = ([x1, y1], [x2, y2]) => { const t = ED * x1 * x2 % EP * y1 % EP * y2 % EP; return [mod((x1 * y2 + y1 * x2) * inv(mod(1n + t, EP), EP), EP), mod((y1 * y2 + x1 * x2) * inv(mod(1n - t, EP), EP), EP)]; };
const edSmall = P => { let Q = P; for (let i = 0; i < 3; i++) Q = edAdd(Q, Q); return Q[0] === 0n && Q[1] === 1n; };
const edSound = buf => { const P = edDecode(buf); return P !== null && !edSmall(P); };
// whether a signing key is one its suite accepts beyond its grammar: an Ed25519 key canonical and not of small order
const keySound = spki => !(isStr(spki) && spki.startsWith(SPKI_PREFIX.std)) || (spki.length === SPKI_PREFIX.std.length + 64 && edSound(Buffer.from(spki.slice(SPKI_PREFIX.std.length), 'hex')));
// a P-256 signature's s is low: no more than half the group order (one signature, one written form)
const P256N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551n;
const lowS = rs => BigInt('0x' + rs.subarray(32, 64).toString('hex')) <= P256N / 2n;
const toLowS = rs => lowS(rs) ? rs : Buffer.concat([rs.subarray(0, 32), Buffer.from((P256N - BigInt('0x' + rs.subarray(32, 64).toString('hex'))).toString(16).padStart(64, '0'), 'hex')]);
const spkiKey = hex => crypto.createPublicKey({ key: Buffer.from(hex, 'hex'), format: 'der', type: 'spki' });
const ieeeKey = hex => ({ key: spkiKey(hex), dsaEncoding: 'ieee-p1363' }); // a P-256 signature is r||s
// a verdict is a pure function of its four arguments: remembered by their digest, so a fold that reads every signature again costs one check each
const VERDICTS = new Map();
function verifyBytes(bytes, sigHex, pubSpkiHex, suite) {
  const k = crypto.createHash('sha256').update(String(suite) + '|' + String(pubSpkiHex) + '|' + String(sigHex) + '|').update(bytes).digest('hex');
  if (VERDICTS.has(k)) return VERDICTS.get(k);
  if (VERDICTS.size > 200000) VERDICTS.clear();
  const v = verifyBytesFresh(bytes, sigHex, pubSpkiHex, suite);
  VERDICTS.set(k, v);
  return v;
}
function verifyBytesFresh(bytes, sigHex, pubSpkiHex, suite) {
  try {
    const s = suite ? suiteOf(suite) : suiteOfKey(pubSpkiHex);
    if (!s || !keyGrammar(s).test(pubSpkiHex)) return false;
    if (!isStr(sigHex) || sigHex.length > 2 * P.limits.signature_bytes) return false; // a signature in any suite is at most limits.signature_bytes: a longer one opens with no key (encoding.md, Bytes)
    if (s === 'p256' && passkeyGrammar().test(sigHex)) return passkeyVerify(bytes, Buffer.from(sigHex, 'hex'), pubSpkiHex);
    if (!sigGrammar(s).test(sigHex)) return false;
    const sig = Buffer.from(sigHex, 'hex');
    if (s === 'std') {
      if (!keySound(pubSpkiHex) || !edSound(sig.subarray(0, 32)) || BigInt('0x' + Buffer.from(sig.subarray(32)).reverse().toString('hex')) >= EL) return false;
      return crypto.verify(null, bytes, spkiKey(pubSpkiHex), sig);
    }
    if (s === 'p256') return lowS(sig) && crypto.verify('sha256', bytes, ieeeKey(pubSpkiHex), sig);
    return sm2Verify(bytes, rawPoint(pubSpkiHex), sigHex);
  } catch { return false; }
}
// ---- passkeys (modules/encoding.md, Passkeys): a WebAuthn assertion as a p256 signature
// The challenge for signed bytes: base64url, no padding, of their SHA-256.
const passkeyChallenge = bytes => crypto.createHash('sha256').update(bytes).digest('base64url');
// sig: r||s (64) | length of authenticatorData (2, big-endian) | authenticatorData | clientDataJSON. The check is encoding.md's four: the form and the cap
// (limits.signature_bytes), bit 0 of the flags byte, clientDataJSON beginning with exactly the 91 bytes of the frame (no JSON is parsed), and the ECDSA signature
function passkeyVerify(bytes, sig, pubSpkiHex) {
  if (sig.length <= 64 || sig.length > P.limits.signature_bytes) return false;
  const n = sig.readUInt16BE(64), auth = sig.subarray(66, 66 + n), cdj = sig.subarray(66 + n);
  if (auth.length !== n || n < P.suites.p256.signature.passkey.min_authenticator_data_bytes || cdj.length === 0 || (auth[32] & 5) !== 5) return false; // 1.9 3d-13: bit 0 (user present) and bit 2 (user verified): a touch alone signs nothing
  const frame = Buffer.from('{"type":"webauthn.get","challenge":"' + passkeyChallenge(bytes) + '","origin":"', 'utf8');
  if (cdj.length < frame.length || !cdj.subarray(0, frame.length).equals(frame)) return false;
  const signed = Buffer.concat([auth, crypto.createHash('sha256').update(cdj).digest()]);
  if (!lowS(sig.subarray(0, 64))) return false;
  return crypto.verify('sha256', signed, ieeeKey(pubSpkiHex), sig.subarray(0, 64));
}
// The WebAuthn signature may be DER; the passkey signature is r||s. DER is one spelling of a value (X.690's distinguished rules): a SEQUENCE
// of two positive INTEGERs, each length in short form, no needless leading 00, nothing after. Any other spelling is not DER and is refused,
// as the core refuses it (end pass 2026-11-20: one form, one meaning).
function derToRs(der) {
  const bad = () => cryptoError('passkey: the signature is DER or r then s');
  if (der.length < 8 || der[0] !== 0x30 || (der[1] & 0x80) || der[1] !== der.length - 2) throw bad();
  const out = Buffer.alloc(64);
  let i = 2;
  for (const at of [0, 32]) {
    if (der[i] !== 0x02 || i + 2 > der.length) throw bad();
    const len = der[i + 1];
    if (len & 0x80 || len === 0 || i + 2 + len > der.length) throw bad();
    let v = der.subarray(i + 2, i + 2 + len);
    if (v[0] & 0x80) throw bad(); // negative
    if (v.length > 1 && v[0] === 0 && !(v[1] & 0x80)) throw bad(); // a needless leading 00
    if (v[0] === 0 && v.length > 1) v = v.subarray(1);
    if (v.length > 32 || v.every(b => b === 0)) throw bad();
    v.copy(out, at + 32 - v.length);
    i += 2 + len;
  }
  if (i !== der.length) throw bad();
  return out;
}
function passkeySignature(authHex, cdjHex, sigHex) {
  const sig = Buffer.from(sigHex, 'hex'), rs = toLowS(sig.length === 64 ? sig : derToRs(sig)), auth = Buffer.from(authHex, 'hex');
  const len = Buffer.alloc(2); len.writeUInt16BE(auth.length);
  return Buffer.concat([rs, len, auth, Buffer.from(cdjHex, 'hex')]).toString('hex');
}
const passkeyChallengeOf = v => {
  const isBlock = isObj(v) && isStr(v.type) && isObj(v.state) && isObj(v.refs);
  const { signature, ...rest } = isObj(v) ? v : {};
  return passkeyChallenge(isBlock ? signedBytes(v, 'p256') : Buffer.from(jcs(rest), 'utf8'));
};
// What a key signs for a block (core.md, section 2): the block's header as canonical JSON, the header naming the block by its id in the key's suite and carrying `key`
// when the block names one; a genesis has no header and is signed over its own canonical bytes. Never the block's own bytes otherwise.
// 1.9 stage 7 (the owner's settling of stage 6's split): a genesis is an actor that names its own signing key and has no author and no seq (the core's is_genesis);
// a block that names no key and no author is no genesis and lacks the common five (`chain`)
const isGenesisBlock = b => isObj(b) && b.type === 'actor' && isObj(b.state) && isObj(b.refs) && isStr(b.state.public_key_sign) && !('author' in b.refs) && !('seq' in b.state);
// an actor read against the genesis's fields (no author, or a signing key named), genesis or not: its closed type is the genesis's, never an actor's
const readsAsGenesis = b => isObj(b) && b.type === 'actor' && isObj(b.state) && isObj(b.refs) && (b.refs.author === undefined || 'public_key_sign' in b.state);
const headerBytes = (b, suite) => isObj(b.refs) && isObj(b.state) && b.refs.author !== undefined ? Buffer.from(jcs(header({ ...b, hash: hashOfBlock(blockOnly(b), suite || 'std') })), 'utf8') : null;
const signedBytes = (b, suite) => (!isGenesisBlock(b) && headerBytes(b, suite)) || Buffer.from(canonOf(b), 'utf8');
const signBlock = (b, privHex, suite) => signBytes(signedBytes(b, suite), privHex, suite);
// The key's own suite decides the algorithm (its SPKI prefix names it); only the header (a genesis: its own bytes) opens. The body form no longer opens.
const verifyBlock = (b, sigHex, pubHex, suite) => verifyBytes(signedBytes(b, suite || suiteOfKey(pubHex) || 'std'), sigHex, pubHex, suite);

// ================================================================ envelopes (privacy.md)
const ENVELOPE = { std: 'x25519-hkdf-sha256-aes-256-gcm', p256: 'p256-hkdf-sha256-aes-256-gcm', sm: 'sm2-hkdf-sm3-sm4-gcm' };
const suiteOfAlg = alg => Object.keys(ENVELOPE).find(s => ENVELOPE[s] === alg);
const xPrivKey = dHex => crypto.createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b656e04220420', 'hex'), Buffer.from(dHex, 'hex')]), format: 'der', type: 'pkcs8' });
const xPubKey = xHex => crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b656e032100', 'hex'), Buffer.from(xHex, 'hex')]), format: 'der', type: 'spki' });
const ecdh = s => crypto.createECDH(s === 'p256' ? 'prime256v1' : 'SM2');
// The encryption public key for a private one, in a suite.
function encPublicOf(dHex, suite) {
  const s = suiteOf(suite);
  if (s === 'std') return crypto.createPublicKey(xPrivKey(dHex)).export({ format: 'der', type: 'spki' }).subarray(12).toString('hex');
  const e = ecdh(s); e.setPrivateKey(Buffer.from(dHex, 'hex')); return e.getPublicKey('hex');
}
function agree(suite, privHex, pubHex) {
  const s = suiteOf(suite);
  if (s === 'std') return crypto.diffieHellman({ privateKey: xPrivKey(privHex), publicKey: xPubKey(pubHex) });
  const e = ecdh(s); e.setPrivateKey(Buffer.from(privHex, 'hex'));
  return e.computeSecret(Buffer.from(pubHex, 'hex'));
}
const kdfHash = s => (s === 'sm' ? 'sm3' : 'sha256');
// SM4 takes a 16-byte key: in the sm suite the content key is the first 16 bytes (privacy.md, Key sizes)
const cipherKey = (s, k) => (s === 'sm' ? k.subarray(0, 16) : k);
function gcmSeal(s, key, iv, pt) {
  if (s === 'sm') { const { out, tag } = sm4gcm(cipherKey(s, key), iv, pt, false); return { ct: out, tag }; }
  const c = crypto.createCipheriv('aes-256-gcm', key, iv); const ct = Buffer.concat([c.update(pt), c.final()]); return { ct, tag: c.getAuthTag() };
}
function gcmOpen(s, key, iv, ct, tag) {
  if (s === 'sm') return sm4gcm(cipherKey(s, key), iv, ct, true, tag).out;
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv); d.setAuthTag(tag); return Buffer.concat([d.update(ct), d.final()]);
}
function envKey(s, secret, ephHex, recipHex) {
  return Buffer.from(crypto.hkdfSync(kdfHash(s), secret, Buffer.concat([Buffer.from(ephHex, 'hex'), Buffer.from(recipHex, 'hex')]), Buffer.from(C.envelope.hkdf_info, 'utf8'), 32));
}
// seal(plaintext, [recipient encryption keys], suite, fixed?); fixed = { ephemeral (private hex), contentKey, nonce, keyNonces[] } for tests.
// 1.9 stage 7 (privacy.md, Sealed messages): a sealer that pads pads the plaintext to the next of 512, 1024, 2048, 4096 bytes, then each 4096. The plaintext is { block, reveals, pad }, `pad` a string of spaces.
// The size counted is the plaintext's own bytes, `pad` included (the padded text is exactly a size); a plaintext that already has a `pad` is padded from its stripped form.
const PAD_SIZES = [512, 1024, 2048, 4096];
const padSize = n => { for (const z of PAD_SIZES) if (n <= z) return z; return Math.ceil(n / 4096) * 4096; };
function padPlain(plain) {
  const base = { ...plain }; delete base.pad;
  const bare = Buffer.byteLength(JSON.stringify(base), 'utf8');
  const withKey = bare + Buffer.byteLength(',"pad":""', 'utf8'); // the key itself costs this much when the plaintext has any pad at all
  const target = padSize(withKey);
  return { ...base, pad: ' '.repeat(target - withKey) };
}
function seal(plaintext, recipients, suite, fixed) {
  const s = suiteOf(suite), f = fixed || {};
  if (f.pad === true) plaintext = padPlain(plaintext);
  let eph = f.ephemeral;
  if (!eph) { if (s === 'std') eph = crypto.randomBytes(32).toString('hex'); else { const e = ecdh(s); e.generateKeys(); eph = e.getPrivateKey('hex').padStart(64, '0'); } }
  const ephPub = encPublicOf(eph, s);
  const ck = f.contentKey ? Buffer.from(f.contentKey, 'hex') : crypto.randomBytes(32), iv = f.nonce ? Buffer.from(f.nonce, 'hex') : crypto.randomBytes(12);
  const body = gcmSeal(s, ck, iv, Buffer.from(JSON.stringify(plaintext), 'utf8'));
  const recips = recipients.map((r, i) => {
    const k = envKey(s, agree(s, eph, r), ephPub, r), n = f.keyNonces ? Buffer.from(f.keyNonces[i], 'hex') : crypto.randomBytes(12);
    const sk = gcmSeal(s, k, n, ck);
    return { encrypted_key: Buffer.concat([sk.ct, sk.tag, n]).toString('base64') };
  });
  return { alg: ENVELOPE[s], ephemeral_key: ephPub, nonce: iv.toString('base64'), ciphertext: Buffer.concat([body.ct, body.tag]).toString('base64'), recipients: recips };
}
// open(envelope, private key hex) -> plaintext object. A reader opens only the envelopes its suites name.
function open(env, privHex) {
  const s = suiteOfAlg(env && env.alg);
  if (!s) throw cryptoError('unknown envelope ' + (env && env.alg), 'unknown_suite');
  const myPub = encPublicOf(privHex, s);
  const k = envKey(s, agree(s, privHex, env.ephemeral_key), env.ephemeral_key, myPub);
  const c = Buffer.from(env.ciphertext, 'base64'), iv = Buffer.from(env.nonce, 'base64');
  for (const r of env.recipients || []) {
    const b = Buffer.from(r.encrypted_key, 'base64');
    if (b.length !== 60) continue;
    let ck; try { ck = gcmOpen(s, k, b.subarray(48, 60), b.subarray(0, 32), b.subarray(32, 48)); } catch { continue; }
    try { return JSON.parse(gcmOpen(s, ck, iv, c.subarray(0, c.length - 16), c.subarray(c.length - 16)).toString('utf8')); } catch { throw cryptoError('the envelope does not open'); }
  }
  throw cryptoError('not a recipient');
}

// ================================================================ the strict check (canonical.md, core.md sections 3, 7, 8)
const RX = Object.fromEntries(Object.entries(P.grammar).filter(([, v]) => typeof v === 'string' && v.startsWith('^')).map(([k, v]) => [k, new RegExp(v)]));
// a decimal names at most limits.decimal_digits digits (core.md section 3)
{ const rx = RX.decimal; RX.decimal = { test: s => typeof s === 'string' && (s.match(/[0-9]/g) || []).length <= P.limits.decimal_digits && rx.test(s) }; }
// how deep a value nests: a scalar 0, an object or array one more than its deepest item
const depthOf = v => (v !== null && typeof v === 'object' ? 1 + Math.max(0, ...Object.values(v).map(depthOf)) : 0);
// the known hash names (core.md, Suites): the prefix of the hash of each suite a reader can use (a row of suites with a hash; the future suite has none)
const KNOWN_HASH_PREFIX = Object.values(P.suites).filter(x => isObj(x) && isStr(x.hash)).map(x => P.hashes[x.hash] && P.hashes[x.hash].prefix).filter(x => typeof x === 'string');
const CLOSED = new Set(P.closed_types);
const SHARED_REFS = new Set([...P.refs.who_and_where, ...P.refs.what_and_which, ...P.verbs, ...P.causal]);
const STATUSES = new Set(P.statuses);
const FIELDS_EVERY = new Set(P.fields.every);
FIELDS_EVERY.add('counted_to'); // 1.9 stage 6 (00-shared, A line goes on): a block signed by those who may speak for the line's owner names in `state.counted_to` the last block of the old line that counts
FIELDS_EVERY.add('rule_set'); // 1.9 3a-13: `state.rule_set` is a field of every type (protocol.json `fields.every` adds it)
// A type's own base fields, and the key fields (defined once) for an actor and a grant.
// a table of protocol.json (or one built from it) read at a name a block wrote: only the table's own entries, never what every object carries
// (`constructor`, `toString`: legal type names; security 02 F3)
const tableEntry = (table, name) => (isObj(table) && isStr(name) && Object.hasOwn(table, name) ? table[name] : undefined);
const baseFields = type => [...(tableEntry(P.fields, type) || []), ...(P.key_fields.on.includes(type) ? P.key_fields.fields : [])];
// days in a month of the proleptic Gregorian calendar, by integers (JavaScript's Date.UTC reads the years 0 to 99 as 1900 to 1999)
const dim = (y, m) => m === 2 ? ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31;
function realDate(s) { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return m >= 1 && m <= 12 && d >= 1 && d <= dim(y, m); }
const realTime = s => realDate(s) && +s.slice(11, 13) < 24 && +s.slice(14, 16) < 60 && +s.slice(17, 19) < 60;
const lonePair = s => { for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c >= 0xd800 && c <= 0xdbff) { const d = s.charCodeAt(i + 1); if (d >= 0xdc00 && d <= 0xdfff) { i++; continue; } return true; } if (c >= 0xdc00 && c <= 0xdfff) return true; } return false; };
const MAXI = P.integers.max;

// A check returns findings { code, detail, stage }. Stage = the number in core.md section 8. GUESS: "The first failure is the refusal" is read as
// "report the findings of the first stage that fails" (several codes of one stage are all listed, in the list's order); core.md also says a block that
// fails several checks gets one refusal per check, and the vectors (a bad currency on a transfer with no refs.what gives only shape) fit the first reading.
function normHeld(h) {
  if (!h) return new Map();
  if (h instanceof Map) return h;
  if (h.held) return normHeld(h.held);
  if (Array.isArray(h)) return new Map(h.filter(Boolean).map(b => [b.hash, b]));
  return new Map();
}
const asList = v => v === undefined ? [] : Array.isArray(v) ? v : [v];
// An id: a bare 64-hex (SHA-256) or a known hash name and colon in front.
function idProblem(s) {
  if (!isStr(s)) return 'grammar';
  const m = /^([a-z0-9-]+):(.*)$/.exec(s);
  if (m) { if (!KNOWN_HASH_PREFIX.includes(m[1] + ':')) return RX.id.test(s) ? 'unknown_suite' : 'grammar'; return /^[0-9a-f]{64}$/.test(m[2]) ? null : 'grammar'; }
  return RX.hash.test(s) ? null : 'grammar';
}
const timeProblem = s => !isStr(s) || !RX.time.test(s) ? 'time' : (!realTime(s) ? 'calendar' : null);
const dateProblem = s => !isStr(s) || !RX.date.test(s) ? 'time' : (!realDate(s) ? 'calendar' : null);
const durationProblem = s => !isStr(s) || !RX.duration.test(s) ? 'time' : null;

// STAGE 4: a grant's limit and its cap on each block still take the 1.7 money shape { minor, currency } here (authority.md is stage 4's, and the text records that these
// cases stay broken until stage 4 lands). Nothing else in this file reads that shape: the money shape is gone from protocol.json, so it is written out here.
const legacyMoneyProblem = m => (!isObj(m) || Object.keys(m).some(k => !['minor', 'currency'].includes(k)) || !Number.isInteger(m.minor) || m.minor < 0 || !isStr(m.currency) ? 'shape' : null);
const has = (o, ...ks) => ks.every(k => k in o);
// An amount { value, unit }, a price (money, or money per unit { money, per }) and a quantity (an amount, or a range { min, max }
// only under a per-unit price) at the places a promise's terms and lines name them (promises.md, Terms). Each returns a code, or null.
// An amount (encoding.md, Shapes): { value, unit } or { value, unit, of }; `of` an id. noOf: beside refs.what and as a thing's pack an amount carries no `of` (shape).
const amountProblem = (a, noOf) => {
  if (a === undefined) return null;
  if (!isObj(a) || Object.keys(a).some(k => !P.shapes.amount.includes(k) && !P.shapes.amount_optional.includes(k)) || !isStr(a.value) || !isStr(a.unit) || a.unit === '') return 'shape';
  if ('of' in a && (noOf || !isStr(a.of) || idProblem(a.of))) return 'shape';
  return RX.decimal.test(a.value) ? null : 'decimal';
};
const perUnit = p => isObj(p) && 'per' in p;
// a price fixed later (promises.md, Terms): { figure, by, signers, deadline, clocks }, and optionally fraction, min, max
const figureKeys = p => isObj(p) && 'figure' in p && P.shapes.price_figure.every(k => k in p) && Object.keys(p).every(k => P.shapes.price_figure.includes(k) || P.shapes.price_figure_optional.includes(k));
function figureProblems(p) {
  const out = [];
  if (!figureKeys(p)) out.push('shape');
  if (!(isStr(p.figure) && p.figure !== '')) out.push('shape');
  if (!(Array.isArray(p.by) && p.by.length && p.by.every(x => isStr(x) && RX.id.test(x)))) out.push('shape');
  if (!(Number.isInteger(p.signers) && p.signers >= 1)) out.push('shape');
  const t = timeProblem(p.deadline); if (t) out.push(t);
  if (clocksOf(p.clocks) === null) out.push('shape');
  if ('fraction' in p && !(isStr(p.fraction) && RX.decimal.test(p.fraction) && decCmp(p.fraction, '0') >= 0 && decCmp(p.fraction, '1') <= 0)) out.push('shape');
  for (const k of ['min', 'max']) if (k in p) { const c = amountProblem(p[k]); if (c) out.push(c); }
  return out;
}
function priceProblems(p) {
  const out = [];
  if (p === undefined) return out;
  if (isObj(p) && 'figure' in p) return figureProblems(p);
  if (isObj(p) && !perUnit(p) && shapeOf(p) === 'amount') { const c = amountProblem(p); return c ? [c] : []; }
  if (perUnit(p)) {
    if (Object.keys(p).some(k => !P.shapes.price_per.includes(k))) out.push('shape');
    if (p.amount === undefined) out.push('shape'); else { const c = amountProblem(p.amount); if (c) out.push(c); }
    const c = amountProblem(p.per); if (c) out.push(c);
    return out;
  }
  return ['shape'];
}
function quantityProblems(q, price) {
  const out = [];
  if (q === undefined) return out;
  if (!(isObj(q) && (q.min !== undefined || q.max !== undefined))) { const c = amountProblem(q); return c ? [c] : []; }
  if (!perUnit(price)) out.push('shape');
  if (Object.keys(q).some(k => !P.shapes.range.includes(k))) out.push('shape');
  for (const e of ['min', 'max']) { if (!(e in q)) continue; const c = amountProblem(q[e]); if (c) out.push(c); }
  if (isObj(q.min) && isObj(q.max) && q.min.unit === q.max.unit && decCmp(q.min.value, q.max.value) > 0) out.push('shape');
  return out;
}
// Shapes are read at the places protocol.json gives them (shapes.places), never by a field name deeper in (encoding.md, Shapes). An object whose keys
// are exactly a shape's is that shape, and is checked as one, in any field; an object with any other keys is data. A shape's own parts are read as it says.
// a place (things.md): a point { lat, lon } in WGS84 degrees, or an area, a point with a radius in m
const deg = (x, lim) => isStr(x) && RX.decimal.test(x) && decCmp(x.replace(/^-/, ''), lim) <= 0;
const whereOk = w => isObj(w) && Object.keys(w).every(k => P.shapes.where.area.includes(k)) && deg(w.lat, '90') && deg(w.lon, '180') && (w.radius === undefined || (isObj(w.radius) && !amountProblem(w.radius) && w.radius.unit === 'm'));
const SHAPES = [['amount', P.shapes.amount], ['amount', [...P.shapes.amount, ...P.shapes.amount_optional]], ['price_per', P.shapes.price_per], ['range', P.shapes.range], ['mark', P.shapes.mark], ['input', P.shapes.input], ['point', P.shapes.where.point], ['area', P.shapes.where.area], ['bound', P.shapes.bound]];
const shapeOf = v => { if (!isObj(v)) return null; if ('figure' in v) return figureKeys(v) ? 'price_figure' : null; const ks = Object.keys(v); const hit = SHAPES.find(([, keys]) => keys.length === ks.length && keys.every(k => ks.includes(k))); return hit ? hit[0] : null; };
function shapeValue(v, out, key) {
  if (Array.isArray(v)) { v.forEach(x => shapeValue(x, out, key)); return; }
  const bad = c => c && out.push({ code: c, detail: 'shape at ' + key });
  switch (shapeOf(v)) {
    case 'amount': bad(amountProblem(v)); break;
    case 'price_per': priceProblems(v).forEach(bad); break;
    case 'price_figure': figureProblems(v).forEach(bad); break;
    case 'range': quantityProblems(v, { per: {} }).forEach(bad); break;
    case 'mark': if (!isStr(v.scheme) || !isStr(v.value)) bad('shape'); break;
    case 'input': bad(idProblem(v.from)); bad(amountProblem(v.amount)); break;
    case 'point': case 'area': if (!whereOk(v)) bad('shape'); break;
    case 'bound': if (ringOf(v) === null) bad('shape'); break;
    default:
  }
}
// what a promise or a transfer moves is never below zero (encoding.md, Shapes): every amount at a place, a range's ends, a price's per
function amountsBelowZero(container, out, key) {
  if (!isObj(container)) return;
  const pl = P.shapes.places, below = a => isObj(a) && isStr(a.value) && RX.decimal.test(a.value) && decCmp(a.value, '0') < 0;
  for (const [k, x] of Object.entries(container)) {
    if (pl.data.includes(k)) continue;
    for (const v of Array.isArray(x) ? x : [x]) {
      const sh = shapeOf(v), parts = sh === 'amount' ? [v] : sh === 'price_per' ? [v.amount, v.per] : sh === 'range' ? [v.min, v.max] : sh === 'input' ? [v.amount] : [];
      if (parts.some(below)) out.push({ code: 'shape', detail: key + '.' + k + ' is zero or more' });
    }
    if (pl.containers.includes(k)) amountsBelowZero(x, out, key + '.' + k);
    else if (pl.lists.includes(k) && Array.isArray(x)) x.forEach(i => amountsBelowZero(i, out, key + '.' + k));
  }
}
function shapeFindings(container, out, key) {
  if (!isObj(container)) return;
  const pl = P.shapes.places;
  for (const [k, x] of Object.entries(container)) {
    if (pl.data.includes(k)) continue; // not a place: a schema's fields, grounds and roles are data (encoding.md, Shapes)
    if (isRL(x)) { // 1.9 stage 4: a range { min, max } or a list { one_of } sits only at the places item 6 of Keeps to names
      if (/(^|\.)terms$|\.lines$/.test(key) && S4_PLACES.includes(k)) { const q = rangeListProblem(x); if (q) out.push({ code: q, detail: 'range or list at ' + key + '.' + k }); }
      else out.push({ code: 'shape', detail: 'a range or a list outside its places at ' + key + '.' + k });
      continue;
    }
    if (k === 'ends_on') continue; // 1.9 (O2): a grant's `scope.ends_on` has its own shape (protocol.json shapes.ends_on), read by the grant's scope check
    if (BARE_FIELDS.includes(k) && shapeOf(x) === null) out.push({ code: 'shape', detail: 'a bare field holds exactly one shape at ' + key + '.' + k });
    shapeValue(x, out, key + '.' + k);
    if (pl.containers.includes(k)) shapeFindings(x, out, key + '.' + k);
    else if (pl.lists.includes(k) && Array.isArray(x)) x.forEach(i => shapeFindings(i, out, key + '.' + k));
  }
}

// Her list of voices and her clock, as written (identity.md, Her voices; protocol.json shapes.voice and clocks). A voice is exactly one of `key`, `key_hash`, `names` with its
// own optional fields; the first is a key or a key_hash; each key, key_hash and id once in all; a list that states a wait above zero, or any reach, states clocks.
// An empty list is a key grant that ends the identity (identity.md, Her voices).
const TERMS_1_9 = ['waits_on', 'in_hand', 'step']; // 1.9 terms the set names (protocol.json terms lists them when the text lands)
const VOICE_FIELDS_1_9 = ['receives', 'passes', 'above', 'each', 'limit', 'every']; // 1.9 stage 4 (A voice's bounds): a key voice may state `each`, `limit` and, with `limit`, `every`; // 1.9 3b-8 `receives`, 3b-11 `passes`: a voice may state each (protocol.json shapes.voice names them when the text lands)
function voicesFindings(state, type, add) {
  if ('clocks' in state && (type === 'actor' || type === 'grant') && clocksOf(state.clocks) === null) add(2, 'shape', 'state.clocks is { names, needed }: sorted block ids, needed by Counts');
  if ('clocks' in state && type === 'grant' && state.kind === 'key' && !('voices' in state)) add(2, 'shape', 'a key grant states clocks only with voices');
  if (!('voices' in state) || (type !== 'grant' && !(type === 'actor' && state.public_key_sign !== undefined))) return;
  const vs = state.voices;
  if (!Array.isArray(vs)) { add(2, 'shape', 'state.voices is a list of voices'); return; }
  if ('public_key_sign' in state && type === 'grant') add(2, 'shape', 'a key grant states voices or one public_key_sign, not both'); // a genesis names its own key beside its list (3d-17)
  const seen = new Set();
  let needsClock = false;
  vs.forEach((v, i) => {
    if (!isObj(v)) { add(2, 'shape', 'a voice is an object'); return; }
    const kinds = ['key', 'key_hash', 'names'].filter(k => k in v);
    const set = kinds.length === 1 ? [...P.shapes.voice[kinds[0]].filter(f => !(kinds[0] === 'key_hash' && f === 'suite')), ...VOICE_FIELDS_1_9] : null; // 1.9 3d-12: a hidden voice states no `suite`
    if (!set || Object.keys(v).some(k => !set.includes(k))) { add(2, 'shape', 'a voice is exactly one of key, key_hash, names with its own fields'); return; }
    if (i === 0 && kinds[0] === 'names') add(2, 'shape', 'the first voice is a key or a key_hash, never other people');
    for (const f of ['each', 'limit']) if (f in v) { const c = amountProblem(v[f]); if (c) add(2, c, 'voice ' + f); else if (decCmp(v[f].value, '0') < 0) add(2, 'shape', 'voice ' + f + ' is zero or more'); }
    if ('every' in v) { const c = durationProblem(v.every); if (c) add(2, c, 'voice every'); else if (!('limit' in v)) add(2, 'shape', 'a voice states every only with limit'); }
    if ('suite' in v && !SUITES.includes(v.suite)) { add(2, 'unknown_suite', 'voice suite'); return; }
    const vs_ = v.suite || 'std';
    if (kinds[0] === 'key') {
      if (!(isStr(v.key) && keyGrammar(vs_).test(v.key) && keySound(v.key))) add(2, 'unknown_suite', 'voice key');
      else { if (seen.has('k' + v.key)) add(2, 'shape', 'a key once in all'); seen.add('k' + v.key); }
    } else if (kinds[0] === 'key_hash') {
      const p = idProblem(v.key_hash);
      if (p) add(2, p, 'voice key_hash');
      else { if (seen.has('h' + v.key_hash)) add(2, 'shape', 'a key_hash once in all'); seen.add('h' + v.key_hash); }
    } else {
      if (!Array.isArray(v.names) || !v.names.length) add(2, 'shape', 'names is a non-empty sorted list of ids');
      else {
        for (const n of v.names) { const p = idProblem(n); if (p) add(2, p, 'voice names'); }
        if (v.names.some((n, j) => j && !(v.names[j - 1] < n))) add(2, 'shape', 'names are sorted, each once');
        for (const n of v.names) { if (seen.has('n' + n)) add(2, 'shape', 'an id once in all'); seen.add('n' + n); }
        if ('needed' in v && !(Number.isInteger(v.needed) && v.needed >= 1 && v.needed <= v.names.length)) add(2, 'shape', 'needed is a whole number from 1 to the size of the set');
      }
    }
    if ('receives' in v && v.receives !== true) add(2, 'shape', 'receives is true, or left out');
    if ('passes' in v && v.passes !== true) add(2, 'shape', 'passes is true, or left out');
    if ('above' in v && (v.above !== true || kinds[0] !== 'names')) add(2, 'shape', 'above is true on a voice of other people, or left out'); // 1.9 3d-14
    for (const f of ['wait', 'reach']) if (f in v) { const q = durationProblem(v[f]); if (q) add(2, q, 'voice ' + f); else if (f === 'reach' || !isZeroDur(v[f])) needsClock = true; }
  });
  if (needsClock && !('clocks' in state)) add(2, 'shape', 'a list that states a wait above zero, or any reach, states clocks');
  if (vs.filter(v => isObj(v) && v.receives === true).length > 1) add(2, 'shape', 'receives is true on one voice at most'); // 1.9 3b-8
}
// 1.9 3a (decided, CORE-SET "What building changed"): a value the text leaves no code for (a suite name, a key or an id outside its grammar, in a block's body) keeps the code `unknown_suite` in `read`, as `grammar` elsewhere.
// 1.9 3a (decided, CORE-SET "What building changed"): a header id (author, prev, key) outside its grammar is `chain` (an unknown hash name there is `unknown_suite`, a wait); a held header's wrong keys are `chain` too.
// 1.9 CORE-SET 3a-1: every finding of the bytes and the values, each in its bucket. `valid` reads the buckets size, bytes and header (in that order, stopping at the first that has
// anything: validCheck); `read` adds the bucket value to check 7. A finding is { stage, code, detail, bucket }.
function contentFindings(b, ctx) {
  const out = [];
  const BUCKET_OF = (stage, code) => (stage === 1 ? 'bytes' : (stage === 2 && (code === 'float' || code === 'integer_range')) ? 'bytes' : code === 'size_limit' ? 'size' : code === 'chain' ? 'header' : 'value');
  // a float or an out-of-range whole number is `not_canonical` in bytes that came as text; in a value handed to a writer (ctx.writer) it keeps its own code
  // (protocol.json refusals.codes.block: float and integer_range are "in a value that never was text"; end pass 2026-11-20, as the core does)
  const add = (stage, code, detail, bucket) => { const bk = bucket || BUCKET_OF(stage, code); out.push({ stage, code: bk === 'bytes' && stage === 2 && !(ctx && ctx.writer) ? 'not_canonical' : code, detail: detail || '', bucket: bk }); };
  const whole = isObj(b) && ['type', 'state', 'refs'].every(k => k in b);
  // ---- exactly {type,state,refs}, strict writing
  if (!isObj(b) || !whole || Object.keys(b).some(k => !['type', 'state', 'refs'].includes(k))) { add(1, 'not_canonical', 'not exactly type, state and refs'); return out; }
  const { type, state, refs } = b;
  if (!isObj(state)) add(1, 'not_canonical', 'state is not an object');
  if (!isObj(refs)) add(1, 'not_canonical', 'refs is not an object');
  if (out.length) return out;
  // ---- the size, first: bytes over limits.block_bytes, or opening more than limits.depth levels, are `size_limit` and nothing else is read (3a-1)
  { let cb = null; try { cb = Buffer.byteLength(canonical(type, state, refs), 'utf8'); } catch (e) { cb = null; }
    if ((cb !== null && cb > P.limits.block_bytes)) add(3, 'size_limit', 'over ' + P.limits.block_bytes);
    if (1 + Math.max(depthOf(state), depthOf(refs)) > P.limits.depth) add(3, 'size_limit', 'nests deeper than ' + P.limits.depth);
    if (out.length) return out; }
  const walk = (v, path) => {
    if (v === null) return add(1, 'not_canonical', 'null at ' + path.join('.'));
    if (isStr(v)) { if (lonePair(v)) add(1, 'not_canonical', 'text that is not well-formed at ' + path.join('.')); return; } // no normal form is checked (core.md, section 3)
    if (typeof v === 'number') {
      // from 1e21 on, JSON (RFC 8785) writes a number with an exponent, so it is a float whatever its value
      if (!Number.isInteger(v) || Math.abs(v) >= 1e21) add(2, 'float', path.join('.'));
      else if (Object.is(v, -0) || Math.abs(v) > MAXI) add(2, 'integer_range', path.join('.'));
      return;
    }
    if (typeof v === 'boolean') return;
    if (Array.isArray(v)) {
      if (path.length === 2 && path[0] === 'refs' && v.every(isStr)) for (let i = 1; i < v.length; i++) if (!(byBytes(v[i - 1], v[i]) < 0)) { add(1, 'not_canonical', 'a set under ' + path.join('.') + ' is not sorted by the bytes of its strings, or repeats'); break; }
      v.forEach((x, i) => walk(x, [...path, i])); return;
    }
    if (isObj(v)) for (const [k, x] of Object.entries(v)) { if (lonePair(k)) add(1, 'not_canonical', 'a key that is not well-formed text'); walk(x, [...path, k]); }
  };
  walk(state, ['state']); walk(refs, ['refs']);
  // ---- stage 2: values
  if (!isStr(type) || !RX.type_name.test(type)) add(2, 'type_name', String(type)); // core.md section 1: a type is a word matching grammar.type_name
  for (const k of P.refs_single) if (isObj(refs) && Array.isArray(refs[k])) add(2, 'grammar', 'refs.' + k + ' is one id'); // core.md section 1: author, prev, answers and updates each hold one id
  // a link is one id or a sorted set of ids, never an empty set (core.md section 5)
  // 1.9 3a-1 (3): the header's links are one id each: an author, prev or key that is a list (or anything but one id) is `chain`
  for (const k of ['author', 'prev', 'key']) if (refs[k] !== undefined && !isStr(refs[k])) add(2, 'chain', 'refs.' + k + ' is one id', 'header');
  for (const [k, v] of Object.entries(refs)) { if (['author', 'prev', 'key'].includes(k) && !isStr(v)) continue; if (Array.isArray(v) && !v.length) add(2, 'grammar', 'refs.' + k + ' is an id or a set of ids'); for (const id of asList(v)) { const p = idProblem(id); if (p) add(2, ['author', 'prev', 'key'].includes(k) ? (p === 'unknown_suite' ? 'unknown_suite' : 'chain') : p, 'refs.' + k, ['author', 'prev', 'key'].includes(k) ? 'header' : 'value'); } }
  const timeAt = (o, where) => {
    if (!isObj(o)) return;
    for (const f of TIME_FIELDS) if (f in o) {
      const v = o[f];
      if ((f === 'pay_by' || f === 'deliver_by') && where !== 'state') { // 1.9 stage 4 (Keeps to, item 6): a time, a duration (added to the start of the occurrence where the promise repeats), or a range or a list of them
        if (isRL(v)) { const q = rangeListProblem(v); if (q) add(2, q, where + '.' + f); continue; }
        if (isStr(v) && parseDur(v)) continue;
      }
      if (f === 'when' && where === 'state' && o.kind === 'cutoff' && parseDur(v)) continue; // 1.9 3d-4: a cutoff of a span states the span itself as its `when`
      if (f === 'when' && !isStr(v)) {
        // blocks.md: an instant, a range { from, to } (from no later than to), a relative form { after, wait }, or a window (not_before, not_after,
        // takes: at least one, alone or beside a range or a relative form); an object that fits none, or any other value, is shape
        const keys = isObj(v) ? Object.keys(v) : [];
        const allowed = [...P.shapes.when, ...P.shapes.when_after, ...P.shapes.when_window];
        const range = isObj(v) && has(v, 'from', 'to'), relative = isObj(v) && has(v, 'after', 'wait'), windowed = P.shapes.when_window.some(k => keys.includes(k));
        if (!isObj(v) || keys.some(k => !allowed.includes(k)) || !(range || relative || windowed)) { add(2, 'shape', where + '.when fits none of its forms'); continue; }
        if (relative) { if (!(isStr(v.after) && v.after !== '')) add(2, 'shape', 'when.after is a block id or an observe kind'); const q = durationProblem(v.wait); if (q) add(2, q, 'when.wait'); }
        for (const e of ['from', 'to', 'not_before', 'not_after']) if (e in v) { const q = timeProblem(v[e]); if (q) add(2, q, 'when.' + e); }
        if (range && !timeProblem(v.from) && !timeProblem(v.to) && v.from > v.to) add(2, 'shape', 'when.from is after its to');
        // a window opens before it closes
        if (isStr(v.not_before) && isStr(v.not_after) && !timeProblem(v.not_before) && !timeProblem(v.not_after) && v.not_before > v.not_after) add(2, 'shape', 'when.not_before is after its not_after');
        if ('takes' in v) { const q = durationProblem(v.takes); if (q) add(2, q, 'when.takes'); }
      } else { const q = timeProblem(v); if (q) add(2, q, where + '.' + f); }
    }
    for (const f of DATE_FIELDS) if (f in o) { const q = dateProblem(o[f]); if (q) add(2, q, where + '.' + f); }
    // per is a duration everywhere but a price's unit (an amount), which sits inside a price, never in a scope
    for (const f of DURATION_FIELDS) if (f in o) { const q = durationProblem(o[f]); if (q) add(2, q, where + '.' + f); }
  };
  timeAt(state, 'state'); timeAt(state.terms, 'terms'); timeAt(state.scope, 'scope');
  // a place (things.md), on any type: a point { lat, lon } in WGS84 degrees, or an area, a point with a radius in m
  if ('where' in state && !whereOk(state.where)) add(2, 'shape', 'state.where is a point or an area');
  if (isObj(state.when)) timeAt({ when: state.when }, 'state');
  if (isObj(state.terms)) for (const l of asList(state.terms.lines)) timeAt(l, 'line');
  for (const flag of ['skip']) if (flag in state && state[flag] !== true) add(2, 'shape', 'state.' + flag + ' is true, or left out'); // 1.9 stage 7 (A5): `withheld` is no field (an unknown field is read's `undeclared_field`)
  // 1.9 stage 4 (S1): her stop of one thing is an observe with status stopped, stop onward and refs.what, naming no refs.updates and no refs.answers; without those it is a status on a block that answers nothing
  if (type === 'observe' && state.status === 'stopped' && refs.updates === undefined && refs.answers === undefined && (state.stop !== 'onward' || asList(refs.what).length !== 1)) add(8, 'status_not_answer', 'a status on a block that neither answers nor updates its author\'s own, bar her stop of one thing');
  for (const k of ['line', 'channel', 'handle']) if (k in state && !isStr(state[k])) add(2, 'shape', 'state.' + k + ' is text');
  // an opening (privacy.md, A commitment) is { salt, value }, the salt in its grammar; a conditioned transfer carries its condition whole (things.md)
  if ('opening' in state && !(isObj(state.opening) && Object.keys(state.opening).every(k => P.shapes.reveal.includes(k)) && isStr(state.opening.salt) && RX.salt.test(state.opening.salt) && state.opening.value !== undefined)) add(2, 'shape', 'state.opening is { salt, value }');
  if ('condition' in state && conditionProblem(state.condition)) add(2, 'shape', 'state.condition');
  // DECIDED (03-amounts, What building changed): [S3-36] protocol.json kind_fields names the kind `received` only in its about text and gives it no `field:shape` line, so check 7 judges its `state.amount` by the field's own shape and reads `state.line` as it reads any open word
  // consent.md: a `yes` must name whom it is about (refs.subject), because it widens what reaches her; observe is an open type, so this is the kind's own rule
  // (end pass 2026-11-20: the oracle had left it out; the core refuses it `required`)
  if (type === 'observe' && isObj(state) && state.kind === 'consent' && state.word === 'yes' && isObj(refs) && refs.subject === undefined) add(8, 'required', 'a consent yes names whom it is about in refs.subject', 'value');
  // the typed fields of a kind (protocol.json kind_fields): `field:shape` lines under a type and a kind; a field that is there must have its shape
  if (isStr(state.kind) && isObj(tableEntry(P.kind_fields, type)) && Array.isArray(tableEntry(P.kind_fields[type], state.kind))) {
    const pick = (path) => path.split('.').reduce((o, k) => (isObj(o) && k in o ? o[k] : undefined), state);
    const closed = (path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), P);
    for (const line of P.kind_fields[type][state.kind]) {
      const at = line.indexOf(':'), field = line.slice(0, at), asked = line.endsWith('!'), shape = line.slice(at + 1, asked ? -1 : undefined), v = pick(field), where = 'state.' + field;
      if (v === undefined) { if (asked) add(2, 'shape', where + ' is stated'); continue; }
      if (shape === 'count') { if (!(Number.isInteger(v) && v >= 1)) add(2, 'shape', where + ' is a whole number of at least 1'); }
      else if (shape === 'text') { if (!isStr(v)) add(2, 'shape', where + ' is text'); }
      else if (shape === 'hash') { if (!(isStr(v) && RX.hash.test(v))) add(2, 'grammar', where + ' is a SHA-256 digest in hex'); }
      else if (shape === 'id') { if (!(isStr(v) && RX.id.test(v))) add(2, 'grammar', where + ' is an id'); }
      else if (shape === 'time') { const q = timeProblem(v); if (q) add(2, q, where); }
      else if (shape === 'time_or_duration') { if (!(isStr(v) && parseDur(v))) { const q = timeProblem(v); if (q) add(2, q, where); } } // 1.9 3d-4: a cutoff's `when` is an instant, or for a span the span itself
      else if (shape.startsWith('in:')) { if (!(isStr(v) && closed(shape.slice(3)).includes(v))) add(2, 'shape', where + ' is one of the list'); }
    }
  }
  // marks, on any type, open or closed (things.md): a list of exactly { scheme, value }, both text
  if ('marks' in state && !(Array.isArray(state.marks) && state.marks.every(m => isObj(m) && Object.keys(m).every(k => P.shapes.mark.includes(k)) && isStr(m.scheme) && isStr(m.value)))) add(2, 'shape', 'state.marks lists exact marks [{ scheme, value }]');
  if ('nonce' in state && (!isStr(state.nonce) || !RX.nonce.test(state.nonce))) add(2, 'grammar', 'nonce');
  // 1.9 stage 4 (A draw): state.draws is { grant, amount }, an id and an amount
  if ('draws' in state && !(isObj(state.draws) && Object.keys(state.draws).every(k => k === 'grant' || k === 'amount') && isStr(state.draws.grant) && RX.id.test(state.draws.grant) && shapeOf(state.draws.amount) === 'amount' && !amountProblem(state.draws.amount))) add(2, 'shape', 'state.draws is { grant, amount }');
  for (const f of ['counted_to']) if (f in state) { const p = idProblem(state[f]); if (p) add(2, p, f); }
  for (const f of ['parties']) if (f in state) for (const id of asList(state[f])) { const p = idProblem(id); if (p) add(2, p, f); }
  // a commitment is written like an id: one in state.audience with a hash name the reader does not know is unknown_suite (core.md, section 2)
  if (Array.isArray(state.audience) && state.audience.some(x => isStr(x) && RX.id.test(x) && idProblem(x) === 'unknown_suite')) add(2, 'unknown_suite', 'state.audience');
  // suites and keys
  for (const f of ['suite']) if (f in state && !SUITES.includes(state[f])) add(2, 'unknown_suite', f);
  const ks = SUITES.includes(state.suite) ? state.suite : 'std';
  if ('public_key_sign' in state && !(isStr(state.public_key_sign) && keyGrammar(ks).test(state.public_key_sign) && keySound(state.public_key_sign))) add(2, 'unknown_suite', 'public_key_sign');
  if ('shown_key' in state && !(isStr(state.shown_key) && suiteOfKey(state.shown_key) !== null && keySound(state.shown_key))) add(2, 'unknown_suite', 'shown_key');
  // her voices and her clock (identity.md, Her voices; blocks.md, A named clock): checked here, in the bytes, with the codes shape, grammar, time and unknown_suite
  voicesFindings(state, type, add);
  // 1.9 3d-17: a genesis that states her list: its own key is the `key` voice of that list that names it; else it is no genesis (`shape`)
  if (type === 'actor' && refs.author === undefined && Array.isArray(state.voices) && !state.voices.some(v => isObj(v) && isStr(v.key) && v.key === state.public_key_sign)) add(2, 'shape', 'a genesis whose key is no voice of its own list');
  if ('public_key_encrypt' in state && !(isStr(state.public_key_encrypt) && encGrammar(ks).test(state.public_key_encrypt))) add(2, 'unknown_suite', 'public_key_encrypt');
  { const found = []; shapeFindings(state, found, 'state'); if (type === 'promise' || type === 'transfer' || type === 'transform') amountsBelowZero(state, found, 'state'); found.forEach(x => add(2, x.code, x.detail)); }
  // an amount beside refs.what, and a thing's pack, carry no `of`: their kind is the measure's own (encoding.md, Shapes)
  if (isObj(state.pack) && 'of' in state.pack) add(2, 'shape', 'a pack carries no of');
  // what a make takes: [{ from, amount }], each `from` one of its refs.derives_from (things.md, A make)
  // 1.9 stage 7 (stage7-oracle-silent.md, conflict 3): `state.inputs` of that shape is a make's (a transform's); a read-back's `state.inputs` (07-last.md C3) is a sorted list of ids, a field of its own kind
  if ('inputs' in state && !(type === 'observe' && state.kind === 'readback')) {
    if (!Array.isArray(state.inputs) || !state.inputs.length) add(2, 'shape', 'state.inputs lists { from, amount }');
    else for (const x of state.inputs) if (!isObj(x) || Object.keys(x).length !== 2 || shapeOf(x) !== 'input' || !asList(refs.derives_from).includes(x.from)) add(2, 'shape', 'state.inputs[].from is one of refs.derives_from');
  }
  // the codes of one check come in the order protocol.json lists them (core.md section 8)
  { const ord = Object.keys(P.refusals.codes.block); out.sort((x, y) => x.stage - y.stage || ord.indexOf(x.code) - ord.indexOf(y.code)); }
  if (out.some(o => o.bucket === 'bytes')) return out;
  if (asList(refs.after).length > P.limits.after_heads) add(3, 'after_limit', 'after names more than ' + P.limits.after_heads);
  // ---- the header: a genesis, or the common five (3a-1: `chain`); a genesis's own value checks and every audience are read's
  const isActor = type === 'actor';
  // an actor with no author, or one that names a signing key, is read against the genesis (core.md section 4: a key comes in by a key grant); any other actor is an ordinary block.
  // 1.9 stage 7: it is a genesis only where it names its key and has no author and no seq; else it has the common five or is `chain`, and what it has of a genesis's is read's `bad_genesis`
  if (isActor && (refs.author === undefined || 'public_key_sign' in state)) {
    const genesis = isStr(state.public_key_sign) && refs.author === undefined && state.seq === undefined; // one rule with isGenesisBlock: a key that is not text names no key
    if (!genesis && (refs.author === undefined || refs.prev === undefined || !Number.isInteger(state.seq) || state.seq < 1 || state.audience === undefined)) add(4, 'chain', 'a block has the common five (author, seq, prev, audience), or is a genesis');
    const bad = [];
    if (refs.author !== undefined || refs.prev !== undefined || refs.after !== undefined || state.seq !== undefined) bad.push('has author, prev, after or seq');
    for (const f of P.genesis.required) if (!(f in state) || (f !== 'audience' && (!isStr(state[f]) || state[f] === ''))) bad.push('missing ' + f);
    // protocol.json genesis.optional_about: reach and clocks, clocks required with reach
    if ('reach' in state && !('clocks' in state)) bad.push('reach with no clocks');
    if ('reach' in state) { const q = durationProblem(state.reach); if (q) add(2, q, 'state.reach'); } // her first voice's reach is a duration (identity.md, Her voices)
    const allowed = new Set([...P.genesis.required, ...P.key_fields.fields.filter(f => !['roles', 'voices', 'shown_key'].includes(f)), 'voices', ...P.genesis.private]); // 1.9 3d-17: a genesis may state her list in `state.voices`
    for (const k of Object.keys(state)) if (!allowed.has(k)) bad.push('field ' + k);
    for (const k of Object.keys(refs)) bad.push('ref ' + k);
    if (bad.length) add(4, 'bad_genesis', bad.join('; '));
    // a genesis's audience is any block's (decision H10): public, or a sorted list of commitments with a nonce
    if (state.audience !== undefined) audienceCheck(state, add);
  } else {
    for (const f of ['author', 'prev']) if (refs[f] === undefined) add(4, 'chain', 'no refs.' + f);
    if (!Number.isInteger(state.seq) || state.seq < 1) add(4, 'chain', 'no state.seq');
    if (state.audience === undefined) add(4, 'chain', 'no state.audience');
    else audienceCheck(state, add);
    // 1.9 3d-2: a block may leave its `at` out (`at_missing` leaves `valid` and `read`); a missing `at` reads as a time not in time, in every part
  }
  // the pieces and the signature are `valid`'s, and the value codes of every bucket 'value' are read's (readFindings)
  return out;
}
// 1.9 CORE-SET 3a-1: what `valid` reads of a block's own bytes: the size, then the bytes, then the header. The first that finds anything, with every code that check found.
const validCheck = (b, ctx) => { const all = contentFindings(b, ctx); for (const k of ['size', 'bytes', 'header']) { const f = all.filter(x => x.bucket === k); if (f.length) return f; } return []; };
// what `read` finds in a valid block's values (the codes that left `valid`), in any type
const valueCheck = (b, ctx) => contentFindings(b, ctx).filter(x => x.bucket === 'value');

// an audience (privacy.md): public, or a sorted list of commitments, a private block carrying a nonce
function audienceCheck(state, add) {
  const a = state.audience;
  if (a === 'public') return;
  // a commitment is written like an id: one with a hash name the reader does not know is unknown_suite (core.md, section 2)
  if (!Array.isArray(a) || !a.length || !a.every(isStr) || a.some(x => idProblem(x) === 'grammar') || a.some((x, i) => i && !(a[i - 1] < x))) add(4, 'audience', 'neither public nor a sorted list of commitments');
  else if (!('nonce' in state)) add(4, 'audience', 'a private block carries a nonce'); // GUESS: the text gives the nonce to private blocks but names no code for its absence
}
function closedFindings(b, ctx, add) {
  const { type, state, refs } = b, held = ctx.held;
  const A = 8;
  const answer = refs.answers !== undefined;
  const counter = type === 'promise' && answer && state.status === undefined;
  const update = refs.updates !== undefined && state.status !== undefined; // the author stopping its own promise or grant: an updates that carries a status
  const asAnswer = (answer && !counter) || update;
  // required
  const req = (cond, what) => { if (!cond) add(A, 'required', what); };
  if (asAnswer) req(state.status !== undefined, 'an answer carries state.status');
  // a promise's terms are fixed once it is written (promises.md): an updates of a promise is its author's stop
  if (type === 'promise') req(refs.updates === undefined || refs.answers !== undefined || state.status === 'stopped' || state.status === 'resumed', 'an updates of a promise is its author\'s stop (state.status stopped), or the end of a pause of their own (resumed)');
  if (type === 'actor') { if (!asAnswer) req(isStr(state.kind) && state.kind !== '', 'actor kind'); }
  if (type === 'grant') {
    if (!asAnswer) {
      req(isStr(state.kind) && state.kind !== '', 'grant kind');
      if (state.kind === 'key') {
        req(refs.subject !== undefined, 'key grant subject');
        // identity.md: a key grant states her list (voices, and the list it replaces in refs.updates), adds one key under a voice, shows a key, or adds an encryption key
        req(['voices', 'public_key_sign', 'public_key_encrypt', 'shown_key'].some(k => k in state), 'a key grant names a key or a list');
        if ('voices' in state) req(refs.updates !== undefined, 'a key grant that states voices names the list it replaces in refs.updates');
      }
      if (state.kind === 'operator') req(refs.to !== undefined, 'operator grant names the agent in refs.to');
    }
  }
  if (type === 'transfer' && !asAnswer) {
    req(refs.what !== undefined || state.amount !== undefined, 'transfer what'); // an amount (state.amount) is the exemption: it names no instance (core.md section 7)
    req(['to_owner', 'to_holder', 'to_place'].some(k => refs[k] !== undefined) || state.count !== undefined, 'transfer moves something');
    // a transfer that names no instance moves an amount of a good the record does not hold, and names a receiver (core.md section 7, things.md Transfers)
    if (refs.what === undefined && state.amount !== undefined) req(refs.to_owner !== undefined, 'a transfer that names no instance names its receiver in to_owner');
    // an amount moves only title: what is kept apart or placed is a thing (core.md section 7)
    if (state.amount !== undefined && (refs.to_holder !== undefined || refs.to_place !== undefined)) add(A, 'shape', 'a transfer with state.amount names neither to_holder nor to_place');
    // an amount beside refs.what carries no `of`: its kind is the measure's own (encoding.md, Shapes). It reads another field, so it is read's (check 7), as the rule above
    if (isObj(state.amount) && 'of' in state.amount && refs.what !== undefined) add(A, 'shape', 'an amount beside refs.what carries no of');
  }
  // a promise of an amount of a good names what it moves in terms.quantity (core.md section 7): money now for money later is one, there is no loan type
  if (type === 'promise' && !asAnswer && !counter) req(refs.what !== undefined || state.what !== undefined || (isObj(state.terms) && state.terms.quantity !== undefined), 'promise what');
  // undeclared
  // A schema the block names declares more fields (its `fields`) and more ref keys (its `roles`), when the checker keeps a schema store
  // (the door's `schemas` list). With no store the fields a schema may declare are not judged; with one, a named schema it does not hold is
  // `undeclared_ref` (ask for it) (core.md, section 8).
  const store = ctx.schemas, schema = refs.schema && store ? store.get(refs.schema) : undefined;
  if (!refs.schema || schema) {
    // only a schema declares: a thing of kind schema; any other block named in refs.schema widens nothing
    const asSchema = schema && schema.type === 'thing' && isObj(schema.state) && schema.state.kind === 'schema' ? schema : undefined;
    const declared = asSchema ? schemaFieldSpecs(asSchema).map(x => x[0]) : [];
    const roles = asSchema && Array.isArray(asSchema.state.roles) ? asSchema.state.roles : [];
    const allowed = new Set([...FIELDS_EVERY, ...baseFields(type), ...declared]); // a profile adds no field: its schema declares them, named by the block (1.8 B1)
    // 1.9 stage 7 (07-last.md D6; 1.8 C6): a machine lock is a plain stop of the machine: `how`, `placer`, `safe`, `reach` and `checked` are no fields, and `lifted` is no status
    for (const k of Object.keys(state)) if (!allowed.has(k)) add(A, 'undeclared_field', k);
    // a key, its suite and her voices are named by a genesis or a key grant alone (core.md, sections 2 and 4): never another actor, never another
    // grant, never a stop or an answer
    const keyHolder = type === 'grant' && state.kind === 'key' && state.status === undefined;
    if (keyHolder && 'reach' in state) add(A, 'undeclared_field', 'reach'); // a voice's reach is stated in her list, never on the key grant (identity.md, Her voices)
    if (!keyHolder) for (const k of ['public_key_sign', 'suite', 'reach', 'voices', 'shown_key', ...(type === 'actor' || type === 'grant' ? ['clocks'] : []), ...(type === 'grant' ? ['public_key_encrypt'] : [])]) if (k in state && !(k === 'clocks' && type === 'actor' && state.kind === 'circle')) add(A, 'undeclared_field', k); // a circle's own `clocks` (C20)
    for (const k of Object.keys(refs)) if (!SHARED_REFS.has(k) && !roles.includes(k)) add(A, 'undeclared_ref', k);
    // a promise's terms are the protocol's (protocol.json terms) and those its schema declares (state.terms, promises.md, Terms): no fold reads a
    // term it does not know, so a schema's own term binds no one
    if (type === 'promise' && isObj(state.terms)) {
      const declaredTerms = asSchema && isObj(asSchema.state.terms) ? Object.keys(asSchema.state.terms) : [];
      for (const k of Object.keys(state.terms)) if (!P.terms.includes(k) && !TERMS_1_9.includes(k) && !declaredTerms.includes(k)) add(A, 'undeclared_field', 'terms.' + k);
      // 1.9 3c-4 `waits_on` is `goods` or `price` (00-shared); 3e-3 `in_hand` is true, or left out; 3e-7 `step` is an amount (an amount in the price's unit)
      if ('waits_on' in state.terms && !['goods', 'price'].includes(state.terms.waits_on)) add(A, 'shape', 'terms.waits_on is goods or price');
      if ('in_hand' in state.terms && state.terms.in_hand !== true) add(A, 'shape', 'terms.in_hand is true, or left out');
      if ('step' in state.terms && (amountProblem(state.terms.step) !== null || !fpos(dec(state.terms.step.value || '0') || F0))) add(A, 'shape', 'terms.step is an amount above zero');
    }
  } // a schema named and not held is read's `names_missing` (it is in `needs`), never a field judged against nothing
  // module checks
  // a circle (circles.md, C1, C10): `pack` whole parts, `rules` rows of one of two shapes, `clocks`; a row's numbers whole and at least 1
  if (type === 'actor' && state.kind === 'circle') {
    const hasPack = 'pack' in state;
    if (hasPack && !(isObj(state.pack) && isAmount(state.pack) && state.pack.unit === 'part' && !('of' in state.pack) && /^[1-9][0-9]*$/.test(state.pack.value))) add(A, 'shape', 'a circle\'s pack is whole parts: an amount of unit part, a whole number of at least 1, with no of');
    if ('rules' in state && !(Array.isArray(state.rules) && state.rules.every(r => rowShapeOk(r, hasPack)))) add(A, 'shape', 'a circle row is { parts, scope } or { to, needed, scope }, every number whole and at least 1, a parts row only on a circle with a pack');
    if ('clocks' in state && clocksOf(state.clocks) === null) add(A, 'shape', 'state.clocks is { names, needed }');
  }
  // a rekey (profiles/rekeys.md): state.epoch a whole number, signed as the circle, with the sealed keys and epoch n-1 in refs.after
  if (type === 'grant' && state.kind === 'key' && 'epoch' in state && !asAnswer) { // an answer is never a grant: no key-grant rule reads it
    if (!(Number.isInteger(state.epoch) && state.epoch >= 1)) add(A, 'shape', 'state.epoch is a whole number of at least 1');
    if (refs.as === undefined) add(A, 'required', 'a rekey is signed as the circle');
    if (state.keys === undefined || refs.after === undefined) add(A, 'required', 'a rekey holds state.keys and names epoch n-1 in refs.after');
  }
  // the founding block's change lines (circles.md, Versions): [{ rule, needed }], each rule once, needed by Counts (folds.md)
  // 1.9 stage 4 (S1): her stop of one thing is an observe with status stopped, stop onward and refs.what, naming no refs.updates and no refs.answers; a lift updates it with status resumed
  if (['promise', 'grant', 'transfer'].includes(type)) { // a status goes with an answer or the author's own stop; a stop goes with status stopped
    const stopOk = x => x === 'before' || x === 'onward' || (isObj(x) && Object.keys(x).every(k => k === 'occurrences') && Array.isArray(x.occurrences) && x.occurrences.every(o => isStr(o) && (timeProblem(o) === null || RX.hash.test(o))));
    // a stop goes only with status stopped (promises.md); it says nothing of why
    if (state.status === undefined) { if ('stop' in state) add(A, 'bad_status', 'state.stop goes with status stopped'); }
    else {
      if (!answer && refs.updates === undefined) add(A, 'status_not_answer', 'status on a block that neither answers nor updates');
      if (!STATUSES.has(state.status)) add(A, 'bad_status', String(state.status));
      // a pause ends by its own signer's updates of it, never by an answer (promises.md, Answers)
      if (state.status === 'resumed' && (refs.updates === undefined || refs.answers !== undefined)) add(A, 'bad_status', 'resumed is the author\'s own updates of their pause');
      if (state.status === 'stopped') {
        if (!stopOk(state.stop)) add(A, 'bad_status', 'state.stop');
      } else if ('stop' in state) add(A, 'bad_status', 'state.stop goes with status stopped');
    }
  }
  if (type === 'promise') {
    // a side is one id (promises.md, Sides)
    for (const k of ['from', 'to']) if (Array.isArray(refs[k])) add(A, 'shape', 'refs.' + k + ' names one side: one id');
    if (answer) {
      if (refs.for === undefined) add(A, 'deal_not_named', 'an answer or counter names the first promise in refs.for');
      else {
        const target = held.get(refs.answers);
        if (target) { const first = target.refs.answers === undefined ? target.hash : target.refs.for; if (first !== undefined && refs.for !== first) add(A, 'deal_not_named', 'refs.for is not the first promise'); }
      }
    }
    // Whether the signer is a side is the fold's to read (folds.md, Who a block speaks for: a block that speaks for neither side counts for nothing):
    // a side may name a thing, whose owner is not a block this one rests on (promises.md, Bearer; core.md, invariant 25), so the check never refuses it.
    // an ask may carry terms.expires or not (decision H11): with none it lasts until its author stops it
    if ('what' in state && !(isStr(state.what) || isObj(state.what))) add(A, 'shape', 'state.what describes time or a job (text, or data under a schema)');
    if ('terms' in state && !isObj(state.terms)) add(A, 'shape', 'state.terms is { price, quantity, lines, ... }');
    const terms = termsOf(b);
    // which terms it may carry is judged with its schema (above); a line is { id, what, quantity, price }
    if ('zone' in terms && !zoneOk(terms.zone)) add(A, 'grammar', 'terms.zone is an IANA time zone name');
    // a wrapped condition names its deadline and clocks (promises.md, By a time); terms.clocks is a named clock (blocks.md)
    if ('condition' in terms && conditionProblem(terms.condition)) add(A, 'shape', 'terms.condition');
    if ('clocks' in terms && clocksOf(terms.clocks) === null) add(A, 'shape', 'terms.clocks is { names, needed }');
    // catch weight (promises.md, Terms): terms.band is a decimal from 0 to 1, a fraction of the quantity chosen
    if ('band' in terms && !(isStr(terms.band) && dec(terms.band) && RX.decimal.test(terms.band) && decCmp(terms.band, '0') >= 0 && decCmp(terms.band, '1') <= 0)) add(A, 'shape', 'terms.band is a decimal from 0 to 1');
    // what the payer gives up if the deal ends before it is done (money), and what is owed that cannot be handed on (true): promises.md, Terms
    if ('forfeit' in terms) { const c = amountProblem(terms.forfeit); if (c) add(A, c, 'terms.forfeit'); else if (decCmp(terms.forfeit.value, '0') < 0) add(A, 'shape', 'terms.forfeit is zero or more'); }
    if ('backing' in terms) { const c = amountProblem(terms.backing); if (c) add(A, c, 'terms.backing'); else if (decCmp(terms.backing.value, '0') < 0) add(A, 'shape', 'terms.backing is zero or more'); }
    // a judge's offer that tries to settle first (true), and the part of her fee she gives back if the sides settle (a decimal 0 to 1; needs the conciliation): promises.md, Rulings
    if ('conciliation' in terms && terms.conciliation !== true) add(A, 'shape', 'terms.conciliation is true');
    if ('fee_back' in terms) {
      if (!(isStr(terms.fee_back) && RX.decimal.test(terms.fee_back) && decCmp(terms.fee_back, '0') >= 0 && decCmp(terms.fee_back, '1') <= 0)) add(A, 'shape', 'terms.fee_back is a decimal from 0 to 1');
      else if (terms.conciliation !== true) add(A, 'shape', 'terms.fee_back needs terms.conciliation');
    }
    // 1.9 stage 7 (A1, Showing a deal): `terms.show` is no term (silence is no promise; a refrain is her signed word): an unknown term is read's `undeclared_field`
    // an answer that carries a status names no term but the quantity it chooses (promises.md, Answers)
    if (state.status !== undefined) for (const k of Object.keys(terms)) if (k !== 'quantity') add(A, 'undeclared_field', 'terms.' + k + ' on an answer');
    // a repeat is an RRULE (one FREQ part, any calendar named by RSCALE) counted from state.when, or an event { after, by, wait }
    if ('repeat' in terms) {
      const r = terms.repeat, named = x => isStr(x) && x !== '';
      if (isStr(r)) { if (!rruleOk(r)) add(A, 'grammar', 'terms.repeat is an RRULE'); if (state.when === undefined) add(A, 'shape', 'a repeat counts from state.when'); if (terms.zone === undefined) add(A, 'shape', 'a calendar repeat is read in terms.zone'); }
      else if (isObj(r)) {
        if (Object.keys(r).some(k => !P.repeat.keys.includes(k)) || !named(r.after) || (r.by !== undefined && !(Array.isArray(r.by) && r.by.length && r.by.every(x => isStr(x) && RX.id.test(x))))) add(A, 'shape', 'a repeat on an event is { after, by, wait }');
        // GUESS: by and wait may be left out (the text names { after, by, wait } and reads by as optional; it does not say wait is required)
        if ('wait' in r) { const q = durationProblem(r.wait); if (q) add(A, q, 'terms.repeat.wait'); }
      } else add(A, 'grammar', 'terms.repeat is an RRULE');
    }
    if ('lines' in terms && !(Array.isArray(terms.lines) && terms.lines.length)) add(A, 'lines', 'terms.lines lists { id, what, quantity, price }');
    for (const c of s4PriceQuantity(terms.price, terms.quantity)) add(A, c, 'terms price or quantity');
    if (Array.isArray(terms.lines)) {
      for (const l of terms.lines) {
        if (!isObj(l) || Object.keys(l).some(k => !P.line.includes(k))) add(A, 'lines', 'a line is { id, what, quantity, price }');
        if (!isObj(l)) continue;
        if (!isStr(l.what) || idProblem(l.what)) add(A, 'lines', 'a line\'s what is a thing\'s hash');
        for (const c of s4PriceQuantity(l.price, l.quantity)) add(A, c, 'line price or quantity');
        if (isObj(l.price) && 'figure' in l.price) add(A, 'lines', 'a line\'s price is an amount: a price fixed later is on the whole promise');
        // 1.9 stage 4 (decided in building): a line's price and quantity are places where a range or a list may sit (protocol.json set_places lists lines.price and lines.quantity); the 1.8 "never a range" is gone
      }
      const ids = terms.lines.map(l => isObj(l) ? l.id : undefined);
      if (ids.some(i => !isStr(i) || i === '') || new Set(ids).size !== ids.length) add(A, 'lines', 'a line has an id unique in the promise');
      else if (terms.price !== undefined || terms.quantity !== undefined) add(A, 'lines', 'lines and a top-level price or quantity');
      // every line's price is of one kind (encoding.md, Shapes: amounts of two kinds are never added)
      const kindsOfLines = new Set(terms.lines.filter(l => isObj(l) && isObj(l.price)).map(l => (perUnit(l.price) ? l.price.amount : l.price)).filter(x => isObj(x) && isStr(x.unit)).map(x => jcs([x.unit, x.of === undefined ? null : x.of])));
      if (kindsOfLines.size > 1) add(A, 'lines', 'every line of one promise is priced in one kind');
      else if (terms.lines.every(l => isObj(l) && isStr(l.what))) { const w = [...new Set(terms.lines.map(l => l.what))].sort(), r = [...new Set(asList(refs.what))].sort(); if (jcs(w) !== jcs(r)) add(A, 'lines', 'refs.what is not the set of the lines\' what'); }
    }
  }
  // a grant to a role is gone with roles (06-circles.md): `to_role` is no field
  if (type === 'grant' && 'fence' in state && !asAnswer) for (const [code, why] of fenceProblems(state.fence)) add(A, code, why);
  // a grant's depth is a whole number of 0 or more (authority.md)
  if (type === 'grant' && 'depth' in state && !(Number.isInteger(state.depth) && state.depth >= 0)) add(A, 'shape', 'state.depth is a whole number');
  // terms.needs is data under a schema, never a bare name (promises.md)
  if (type === 'promise' && isObj(state.terms) && 'needs' in state.terms && !(isObj(state.terms.needs) || Array.isArray(state.terms.needs))) add(A, 'shape', 'terms.needs is data from a schema');
  // many hands (circles.md): state.needed { power: N } for the powers circle.needed lists, N a whole number of at least 1
  // a grant's scope, whatever its kind (authority.md): an object, its types a list of types, its parties ids. A stop or an answer is never a grant,
  // whatever scope it restates: no scope rule reads it
  if (type === 'grant' && 'scope' in state && !asAnswer) {
    if (!isObj(state.scope)) add(A, 'shape', 'state.scope is an object');
    else {
      if (state.scope.types !== undefined && !(Array.isArray(state.scope.types) && state.scope.types.every(isStr))) add(A, 'shape', 'scope.types lists types');
      if (state.scope.parties !== undefined && !(Array.isArray(state.scope.parties) && state.scope.parties.every(x => isStr(x) && RX.id.test(x)))) add(A, 'grammar', 'scope.parties lists hashes');
      else if (Array.isArray(state.scope.parties) && state.scope.parties.some(x => idProblem(x) === 'unknown_suite')) add(A, 'unknown_suite', 'scope.parties names a hash this reader does not know');
    }
  }
  // a payment for several promises (things.md): state.split is a non-empty list of { for, line, amount, occurrence }, each `for` one of refs.for, its amount an amount
  // and its line, when given, a line id
  if (type === 'transfer' && 'split' in state) {
    const parts = state.split;
    if (!Array.isArray(parts) || !parts.length) add(A, 'shape', 'state.split lists { for, line, amount, occurrence }');
    else for (const x of parts) {
      if (!isObj(x) || Object.keys(x).some(k => !P.shapes.split.includes(k)) || !asList(refs.for).includes(x.for)) add(A, 'shape', 'state.split[].for is one of refs.for');
      if (!isObj(x) || shapeOf(x.amount) !== 'amount') add(A, 'shape', 'state.split[].amount is an amount');
      if (isObj(x) && x.line !== undefined && !isStr(x.line)) add(A, 'shape', 'state.split[].line is a line id');
      if (isObj(x) && x.occurrence !== undefined && !(isStr(x.occurrence) && (timeProblem(x.occurrence) === null || RX.hash.test(x.occurrence)))) add(A, 'shape', 'state.split[].occurrence is a start time or a hash');
    }
  }
  // a payment for several promises says how much goes to each (things.md, Transfers): its split, the payment's own kind and adding up to no more than it
  if (type === 'transfer' && !asAnswer && 'amount' in state && !('split' in state) && asList(refs.for).length > 1) add(A, 'required', 'a payment for several promises says how much goes to each (state.split)');
  const okAmount = m => shapeOf(m) === 'amount' && !amountProblem(m);
  if (type === 'transfer' && Array.isArray(state.split) && okAmount(state.amount) && state.split.every(x => isObj(x) && okAmount(x.amount))) {
    if (state.split.some(x => !sameKind(x.amount, state.amount))) add(A, 'shape', 'every part of state.split is of the payment\'s own kind');
    else if (fcmp(state.split.reduce((t, x) => fadd(t, dec(x.amount.value)), { n: 0n, d: 1n }), dec(state.amount.value)) > 0) add(A, 'shape', 'state.split adds up to no more than state.amount');
  }
  // what a payment covers is the word of the side it is paid to (promises.md, Settling): an amount, only on that side's accepted answer
  // 1.9-GUESS [5-21] 1.9 stage 5 (things.md, A spot exchange; R-P5): the seller's transfer `for` the buyer's order, `to_owner` her, of the instance it names, is his yes and his delivery in one block; it states `state.covers` (`required`): what the seller says he has had of the price
  const spotOrderOf = (r) => {
    if (type !== 'transfer' || r.answers !== undefined || state.status !== undefined || !isStr(r.to_owner) || !isStr(r.for) || !isStr(r.author)) return null;
    const o = held.get(r.for);
    if (!(o && o.type === 'promise' && o.refs.answers === undefined && o.state.status === undefined && o.refs.to === r.to_owner && o.refs.author === r.to_owner && o.refs.from === r.author && asList(o.refs.what).some(h => asList(r.what).includes(h)))) return null;
    // the transfer is his yes and his delivery in one block only where he has not already said yes: an accept of the order by the seller before it makes it an ordinary delivery
    for (const x of held.values ? held.values() : []) if (x && x.type === 'promise' && x.state.status === 'accepted' && x.refs.answers === o.hash && x.refs.author === r.author) return null;
    return o;
  };
  const spot = spotOrderOf(refs);
  if (type === 'transfer' && 'covers' in state) {
    const c = amountProblem(state.covers);
    if (c) add(A, c, 'state.covers is an amount');
    if (!spot && (refs.answers === undefined || state.status !== 'accepted')) add(A, 'shape', 'state.covers goes only on an accepted answer to a payment, or on the seller\'s transfer for a buyer\'s order');
  } else if (spot) add(A, 'required', 'a seller\'s transfer for a buyer\'s order states state.covers (0 if nothing came): a missing covers is never read as credit');
  // a payment names the occurrence of a standing promise it pays (promises.md, Settling; decision E4): its start time, or the hash of the block that
  // started it, as a stop names occurrences
  if (type === 'transfer' && 'occurrence' in state && !((isStr(state.occurrence) && (timeProblem(state.occurrence) === null || RX.hash.test(state.occurrence))) && state.amount !== undefined)) add(A, 'shape', 'state.occurrence goes on a payment: a start time, or the hash of the block that started it');
  // how many received (things.md): a whole number of at least 1
  if (type === 'transfer' && 'clocks' in state && (refs.to_owner !== undefined || clocksOf(state.clocks) === null)) add(A, 'shape', 'state.clocks goes on an open hand-over and is { names, needed }');
  if (type === 'transfer' && 'clocks' in state && (refs.to_owner !== undefined || clocksOf(state.clocks) === null)) add(A, 'shape', 'state.clocks goes on an open hand-over and is { names, needed }');
  if (type === 'transfer' && 'count' in state && !(Number.isInteger(state.count) && state.count >= 1)) add(A, 'shape', 'state.count is a whole number from 1');
  // the scope's own rules hold whatever the kind (a grant with no kind is refused for that too)
  if (type === 'grant' && !asAnswer) {
    const scope = isObj(state.scope) ? state.scope : null;
    if (scope) for (const k of Object.keys(scope)) if (!P.scope.includes(k)) add(A, 'undeclared_field', 'scope.' + k);
    // 1.9 stage 4 (A2): a limit and a cap on each block are amounts of zero or more; nothing hides a limit. `every` goes with `limit` and `until`; `fallback` is `lowest` and goes with `deadline`; `clocks` is { names, needed }
    if (scope) {
      for (const k of ['limit', 'each']) if (scope[k] !== undefined) { const c = amountProblem(scope[k]); if (c) add(A, c, 'scope.' + k); else if (decCmp(scope[k].value, '0') < 0) add(A, 'shape', 'scope.' + k + ' is zero or more'); }
      if (scope.on !== undefined) { if (!(Array.isArray(scope.on) && scope.on.every(x => isStr(x) && RX.id.test(x)))) add(A, 'grammar', 'scope.on lists ids'); else if (scope.on.some(x => idProblem(x) === 'unknown_suite')) add(A, 'unknown_suite', 'scope.on names a hash this reader does not know'); }
      if (scope.every !== undefined) { if (scope.limit === undefined) add(A, 'shape', 'scope.every goes with scope.limit'); if (scope.until === undefined) add(A, 'required', 'scope.every goes with scope.until'); }
      if (scope.fallback !== undefined) { if (!P.fallbacks.includes(scope.fallback)) add(A, 'shape', 'scope.fallback is lowest'); if (scope.deadline === undefined) add(A, 'shape', 'scope.fallback goes with scope.deadline'); }
      if ('clocks' in scope && clocksOf(scope.clocks) === null) add(A, 'shape', 'scope.clocks is { names, needed }');
      if ('ends_on' in scope) { const c = endsOnProblem(scope.ends_on); if (c) add(A, c, c === 'grammar' ? 'scope.ends_on.witness is an id' : 'scope.ends_on is { witness, said }, said text'); } // 1.9 (O2): her own ending term
    }
    // 1.9 stage 6 (C13): a grant signed `as` a circle is no wider than the row that holds for it, as a child grant is no wider than its parent
    // 1.9 stage 6 (D3): a grant `as` a circle wider than its row is no finding of read: no row holds for it, so it waits (on: hands)
    // every grant that can bind (one with `scope.on` or `refs.what`) names its line (00-shared, `refs.meter`)
    if (!asAnswer && state.status === undefined && ((scope && scope.on !== undefined) || refs.what !== undefined) && refs.meter === undefined) add(A, 'required', 'a grant with scope.on or refs.what names its line in refs.meter');
    // a grant may carry scope.until or not, whatever its kind (decision H11): with one it ends then, with none it lasts until its author stops it
    if (refs.parent !== undefined) {
      const parent = held.get(refs.parent);
      if (parent) {
        // a circle that received it passes it on by a block signed as the circle; whether the signer may sign for it there is the fold's (decision D15)
        if (!isStr(parent.refs.to) || (parent.refs.to !== refs.author && parent.refs.to !== refs.as)) add(A, 'not_receiver', 'passed on by someone other than the receiver');
        const childCode = childProblem(state, refs, parent, held);
        if (childCode) add(A, childCode, childCode === 'shape' ? 'a child is never open and never to a role' : 'wider than the parent');
      }
    }
  }
}

// an IANA time zone name: UTC, or Area/Location (promises.md, Terms)
const zoneOk = z => isStr(z) && RX.zone.test(z);
// an RFC 5545 RRULE value: KEY=VALUE parts (grammar.rrule_part), exactly one of them FREQ from repeat.freq (RFC 7529 may name the calendar first, by RSCALE)
const rruleOk = r => { const parts = r.split(';'); return parts.every(x => RX.rrule_part.test(x)) && parts.filter(x => x.startsWith('FREQ=')).length === 1 && parts.some(x => x.startsWith('FREQ=') && P.repeat.freq.includes(x.slice(5))); };
// ---- scope subset rules (authority.md): a child's scope is a subset of its parent's on every field.
// Durations are compared by adding both to the same instant, the parent grant's at.
function parseDur(s) {
  if (!isStr(s) || !RX.duration.test(s)) return null; // 'P', 'PT' and 'P1DT' are no durations (grammar.duration)
  const m = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(s);
  if (!m) return null;
  const n = m.slice(1).map(x => +(x || 0));
  return { Y: n[0], M: n[1], W: n[2], D: n[3], h: n[4], m: n[5], s: n[6] };
}
// the span a duration adds to one fixed instant (2000-01-01T00:00:00Z), in milliseconds; null when it is no duration (durations are compared, never added to a date: core.md, section 3)
const spanMs = d => { const t = parseDur(d) ? addDur('2000-01-01T00:00:00.000Z', d) : null; return t === null ? null : Date.parse(t) - Date.parse('2000-01-01T00:00:00.000Z'); };
// null when the result is no time (core.md section 3: a year from 0000 to 9999) or a number is too large: a duration that cannot be read is never small
function addDur(iso, dur, sign = 1) { // calendar months and years in UTC, then days and time
  const p = parseDur(dur), d = new Date(iso);
  if (!p || isNaN(d.getTime()) || Object.values(p).some(n => !Number.isSafeInteger(n))) return null;
  const day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCFullYear(d.getUTCFullYear() + sign * p.Y, d.getUTCMonth() + sign * p.M);
  d.setUTCDate(Math.min(day, dim(d.getUTCFullYear(), d.getUTCMonth() + 1))); // core.md section 3: a day past the month's end is its last day
  const ms = d.getTime() + sign * (((p.W * 7 + p.D) * 24 + p.h) * 3600 + p.m * 60 + p.s) * 1000;
  if (!Number.isFinite(ms) || ms < -62167219200000 || ms > 253402300799999) return null;
  return new Date(ms).toISOString();
}
const subsetOf = (a, b) => asList(a).every(x => asList(b).some(y => jcs(x) === jcs(y)));
// a sum of money in one currency, or of an amount in one unit, no larger than the parent's
const noLarger = (cv, pv) => isObj(pv) && 'unit' in pv ? (isObj(cv) && 'unit' in cv && jcs(cv.unit) === jcs(pv.unit) && decCmp(cv.value, pv.value) <= 0) : (isObj(cv) && isObj(pv) && !('unit' in cv) && jcs(cv.currency) === jcs(pv.currency) && Number.isInteger(cv.minor) && cv.minor <= pv.minor);
// the orders of protocol.json narrower_than; a duration is compared by adding both to `at`, the parent grant's own (with none there is no instant, and nothing is filled in)
const ORDER = {
  subset: subsetOf,
  'subset-or-none': subsetOf,
  'at-most': noLarger,
  'at-least-duration': (c, p, at) => !!at && addDur(at, c) !== null && addDur(at, p) !== null && addDur(at, c) >= addDur(at, p),
  'at-most-time': (c, p) => !(c > p),
  superset: (c, p) => (isObj(p) && isObj(c) ? Object.entries(p).every(([k, v]) => k in c && jcs(c[k]) === jcs(v)) : subsetOf(p, c)),
};
// narrowerThan(c, p, at, fields): the child's scope keeps to the parent's on every field the parent states (authority.md), each by its order
function narrowerThan(c, p, at, fields = Object.keys(P.narrower_than)) {
  // a field of the order subset-or-none left out names none (parties): a child that states more than a parent that states none is wider
  return fields.every(f => {
    const order = P.narrower_than[f], none = order === 'subset-or-none';
    const pv = p[f] === undefined && none ? [] : p[f], cv = c[f] === undefined && none ? [] : c[f];
    return pv === undefined || (cv !== undefined && ORDER[order](cv, pv, at));
  });
}
// ---- a machine's fence (authority.md, A machine's fence)
// an hour of day with its own offset, as a minute of the UTC day (0..1439); null outside grammar.hour
function hourMinute(s) {
  if (!isStr(s) || !RX.hour.test(s)) return null;
  const local = +s.slice(0, 2) * 60 + +s.slice(3, 5);
  const off = s[5] === 'Z' ? 0 : (s[5] === '-' ? -1 : 1) * (+s.slice(6, 8) * 60 + +s.slice(9, 11));
  return (((local - off) % 1440) + 1440) % 1440;
}
// the 1440 minutes a non-empty hours list covers; null when the list or an entry cannot be read (an entry of one minute twice is none)
function hoursCover(hours) {
  if (!Array.isArray(hours) || !hours.length) return null;
  const cover = new Array(1440).fill(false);
  for (const e of hours) {
    if (!isObj(e) || Object.keys(e).length !== 2 || !('from' in e) || !('to' in e)) return null;
    const s = hourMinute(e.from), f = hourMinute(e.to);
    if (s === null || f === null || s === f) return null;
    for (let m = 0; m < 1440; m++) if (s < f ? (m >= s && m < f) : (m >= s || m < f)) cover[m] = true;
  }
  return cover;
}
// ---- a machine lock (patterns/machines.md; 1.8 C6, kept by 07-last.md D6)
// A machine lock is a stop of a machine: a grant of kind `stop` whose `refs.subject` is the machine. It is the owner's word when it is backed by the machine's owner, as the ownership fold reads him in
// the lock's causal past: his own block, or one signed under a grant of his that covers the type `grant.stop` and that machine. It ends as anything ends: by its author's stop (or its own `scope.until`
// against the reader's clock). Any other signer's stop of a machine is that signer's reading: shown, and locking nothing.
// machineLock(machine, blocks, now): { locked, locks, claimed }: locks the ids of the standing stops backed by the owner, claimed the ids of the other standing stops, each sorted
function machineLock(machine, blocks, now) {
  if (!isObj(machine)) throw argError('argument 0 is the machine (a thing block)');
  const pool = new Pool([machine, ...poolOf(blocks).all().filter(x => x.hash !== machine.hash)]);
  const m = machine.hash;
  const isStop = b => b.type === 'grant' && b.state.kind === 'stop' && b.state.status === undefined && b.refs.answers === undefined && b.refs.subject === m && counts(b, pool);
  const locks = [], claimed = [];
  for (const lock of pool.all().filter(isStop).sort(byHash)) {
    if (!grantLive(lock, pool) || (now && isObj(lock.state.scope) && isStr(lock.state.scope.until) && lock.state.scope.until <= now)) continue;
    const owner = ownershipFold(machine, pool, pool.past(lock.hash)).owner;
    (owner !== null && backedIn(lock, owner, pool).backed ? locks : claimed).push(lock.hash);
  }
  return { locked: locks.length > 0, locks, claimed };
}
// codes the write check finds in a grant's state.fence
function fenceProblems(env) {
  const out = [];
  if (!isObj(env)) return [['shape', 'state.fence is an object']];
  for (const k of Object.keys(env)) if (!['ranges', 'hours', 'safe_state', 'work_alone'].includes(k)) out.push(['undeclared_field', 'fence.' + k]);
  if ('ranges' in env) {
    if (!Array.isArray(env.ranges) || !env.ranges.length) out.push(['shape', 'fence.ranges']);
    else {
      const seen = [];
      for (const r of env.ranges) {
        const ok = isObj(r) && Object.keys(r).every(k => ['of', 'min', 'max'].includes(k)) && isStr(r.of) && r.of !== '' && !seen.includes(r.of) && ('min' in r || 'max' in r)
          && ['min', 'max'].every(k => !(k in r) || amountProblem(r[k]) === null)
          && (!('min' in r && 'max' in r) || (r.min.unit === r.max.unit && decCmp(r.min.value, r.max.value) <= 0));
        if (!ok) out.push(['shape', 'fence.ranges item']); else seen.push(r.of);
      }
    }
  }
  if ('hours' in env) {
    if (!Array.isArray(env.hours) || !env.hours.length) out.push(['shape', 'fence.hours']);
    else for (const e of env.hours) {
      if (!isObj(e) || Object.keys(e).length !== 2 || !isStr(e.from) || !isStr(e.to)) out.push(['shape', 'fence.hours item']);
      else if (hourMinute(e.from) === null || hourMinute(e.to) === null) out.push(['grammar', 'fence.hours hour']);
      else if (hourMinute(e.from) === hourMinute(e.to)) out.push(['shape', 'fence.hours item is one minute twice']);
    }
  }
  if ('safe_state' in env && !(isStr(env.safe_state) && env.safe_state !== '')) out.push(['shape', 'fence.safe_state']);
  if ('work_alone' in env && durationProblem(env.work_alone)) out.push(['time', 'fence.work_alone']);
  return out;
}
// is the child's fence (states of two grants) no wider than the parent's
function fenceWithin(child, parent, at) {
  const c = isObj(child.fence) ? child.fence : {}, p = isObj(parent.fence) ? parent.fence : {};
  if (p.ranges !== undefined) {
    for (const pr of p.ranges) {
      const cr = Array.isArray(c.ranges) ? c.ranges.find(x => isObj(x) && x.of === pr.of) : undefined;
      if (!cr) return false;
      for (const end of ['min', 'max']) {
        if (pr[end] === undefined) continue;
        if (cr[end] === undefined || cr[end].unit !== pr[end].unit) return false;
        const d = decCmp(cr[end].value, pr[end].value);
        if (!(end === 'min' ? d >= 0 : d <= 0)) return false;
      }
    }
  }
  if (p.hours !== undefined) {
    const pc = hoursCover(p.hours), cc = hoursCover(c.hours);
    if (!pc || !cc || cc.some((on, i) => on && !pc[i])) return false;
  }
  if (p.safe_state !== undefined && c.safe_state !== p.safe_state) return false;
  if (c.work_alone !== undefined) {
    // 1.9: two spans are compared by what each adds to one fixed instant, never added to a date (authority.md, A range and a list; blocks.md, Time)
    const FIXED = '2000-01-01T00:00:00.000Z';
    const cw = addDur(FIXED, c.work_alone), pw = addDur(FIXED, p.work_alone === undefined ? 'PT0S' : p.work_alone);
    if (cw === null || pw === null || cw > pw) return false;
  }
  return true;
}
// fenceReading(fence, at, readings, heard): { within, why, alone, alone_until }
function fenceReading(env, at, readings, heard) {
  const junk = { within: false, why: [{ code: 'junk', of: null }], alone: false, alone_until: null };
  if (env !== null && env !== undefined && fenceProblems(env).length) return junk;
  if (timeProblem(at) !== null) return junk;
  const e = isObj(env) ? env : {}, why = [];
  if (e.hours !== undefined) {
    const cover = hoursCover(e.hours), minute = Math.floor(Date.parse(at) / 60000) % 1440;
    if (!cover[minute]) why.push({ code: 'outside_hours', of: null });
  }
  for (const r of e.ranges || []) {
    const said = isObj(readings) ? readings[r.of] : undefined;
    const unit = (r.min || r.max).unit;
    if (said === undefined || amountProblem(said) !== null || said.unit !== unit) { why.push({ code: 'unread', of: r.of }); continue; }
    if ((r.min && decCmp(said.value, r.min.value) < 0) || (r.max && decCmp(said.value, r.max.value) > 0)) why.push({ code: 'out_of_range', of: r.of });
  }
  const until = isStr(heard) ? addDur(heard, e.work_alone === undefined ? 'PT0S' : e.work_alone) : null;
  return { within: why.length === 0, why, alone: until !== null && Date.parse(at) <= Date.parse(until), alone_until: until };
}
function scopeWithin(child, parent) {
  const c = isObj(child.scope) ? child.scope : {}, p = isObj(parent.scope) ? parent.scope : {};
  if (!narrowerThan(c, p, isStr(parent.at) && parent.at !== '' ? parent.at : null)) return false;
  // a sealed limit is compared only where the amount is (the principal's node); here the child must still carry a limit
  if (p.limit_commitment !== undefined && c.limit_commitment === undefined && c.limit === undefined) return false;
  // a limit with no period covers all time: a child with a period under it could spend it again every period
  if (p.limit !== undefined && p.every === undefined && c.every !== undefined) return false;
  if (!fenceWithin(child, parent, isStr(parent.at) && parent.at !== '' ? parent.at : null)) return false;
  // a grant that names a handle is passed on only to that handle
  if (parent.handle !== undefined && child.handle !== parent.handle) return false;
  const pd = parent.depth === undefined ? 0 : parent.depth, cd = child.depth === undefined ? 0 : child.depth;
  return pd >= 1 && cd <= pd - 1;
}

// ---- the codes of one check, in the order of protocol.json (refusals.codes.block; refusals.read)
const CODE_ORDER = Object.keys(P.refusals.codes.block);
const inCodeOrder = list => uniqueCodes(list).sort((a, b) => CODE_ORDER.indexOf(a.code) - CODE_ORDER.indexOf(b.code));
const READ_ORDER = [...P.refusals.read, 'type_name', 'after_limit', 'audience', 'bad_genesis', 'at_missing', 'unknown_suite', 'unknown_rules']; // 1.9 3a-1, 3a-13: the codes that moved to `read`
// read's codes, in the order of protocol.json refusals.read, which lists every code read gives (check 7 finds shape, grammar, decimal, time and calendar in a closed block's
// terms, scope, condition and epoch too).
const readRank = c => (READ_ORDER.includes(c) ? READ_ORDER.indexOf(c) : 100 + CODE_ORDER.indexOf(c));
const inReadOrder = list => uniqueCodes(list).sort((a, b) => readRank(a.code) - readRank(b.code));
// The findings of the first stage that failed, one per code (core.md, section 8: valid stops at the first check that finds anything)
const refusalOf = found => (found.length ? inCodeOrder(found.filter(f => f.stage === Math.min(...found.map(g => g.stage)))) : []);
// A block as a writer must write it: checks 1 to 4, then, for a closed type, check 7 with no block held and no schema. (What the pure functions read: pureJunk.)
// 1.9 3a-1, 3a-3: a writer signs only what its own `read` reads: what `valid` finds of the bytes, else every code `read` finds with nothing held (the values, the closed type, the rule set).
function writeFindings(block, heldIn) {
  const early = validCheck(block, { writer: true });
  if (early.length) return inCodeOrder(early);
  const b = blockOnly(block), found = valueCheck(b, {}).map(f => ({ stage: f.stage, code: f.code, detail: f.detail }));
  const heldMap = new Map((Array.isArray(heldIn) ? heldIn : []).filter(x => isObj(x) && isStr(x.hash)).map(x => [x.hash, x]));
  if (CLOSED.has(b.type) && !readsAsGenesis(b)) closedFindings(b, { held: heldMap, schemas: new Map() }, (stage, code, detail) => found.push({ stage, code, detail }));
  if (isObj(b.state) && b.state.rule_set !== undefined && !RUNS.includes(b.state.rule_set)) found.push({ stage: 9, code: 'unknown_rules', detail: 'state.rule_set names a set this reader does not run' });
  return inReadOrder(found);
}

// ---- the wire (canonical.md, On the wire): a message is its canonical bytes. Parse the text, write the value back as RFC 8785 writes it, and take it only when the
// two are the same bytes; a number token other than `0` or `-?[1-9][0-9]*` in range, a space, a key out of order, a repeated key, a longer escape, text that
// is not well-formed, or text that is not JSON gives { ok: false }.
function wireParse(text) {
  if (typeof text !== 'string') return { ok: false, why: 'not text' };
  let i = 0;
  const fail = why => { throw new Error(why); };
  const str = () => {
    if (text[i] !== '"') fail('string expected');
    let j = i + 1;
    while (j < text.length && text[j] !== '"') { if (text.charCodeAt(j) < 0x20) fail('control character'); if (text[j] === '\\') j++; j++; }
    if (j >= text.length) fail('unterminated string');
    const s = JSON.parse(text.slice(i, j + 1));
    if (lonePair(s)) fail('text that is not well-formed');
    i = j + 1; return s;
  };
  const value = d => {
    const c = text[i];
    if ((c === '{' || c === '[') && d + 1 > READ_DEPTH) fail('too deep'); // a carrier of more than limits.read_depth levels (3a-8)
    if (c === '{') {
      i++; const o = {};
      if (text[i] === '}') { i++; return o; }
      for (;;) {
        const k = str(); if (text[i++] !== ':') fail('colon expected');
        // a key is a key whatever its name: __proto__ too is an own property, never the object's prototype
        Object.defineProperty(o, k, { value: value(d + 1), enumerable: true, writable: true, configurable: true });
        if (text[i] === ',') { i++; continue; } if (text[i] === '}') { i++; return o; } fail('object');
      }
    }
    if (c === '[') { i++; const a = []; if (text[i] === ']') { i++; return a; } for (;;) { a.push(value(d + 1)); if (text[i] === ',') { i++; continue; } if (text[i] === ']') { i++; return a; } fail('array'); } }
    if (c === '"') return str();
    const m = /-?[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?/y; m.lastIndex = i;
    const t = m.exec(text);
    if (t) {
      if (!/^(0|-?[1-9][0-9]*)$/.test(t[0])) fail('a number token that is not canonical');
      const n = Number(t[0]); if (Math.abs(n) > MAXI) fail('a number out of range');
      i += t[0].length; return n;
    }
    for (const [w, v] of [['true', true], ['false', false]]) if (text.startsWith(w, i)) { i += w.length; return v; } // 1.9 3a-8: there is no null
    fail('not JSON');
  };
  try {
    const v = value(0);
    if (i !== text.length) fail('bytes after the value');
    if (jcs(v) !== text) fail('not the canonical bytes of the value');
    return { ok: true, value: v };
  } catch (e) { return { ok: false, why: String(e && e.message) }; }
}
// a refusal of strict_text and strict_push carries `hash`, the SHA-256 of the bytes as they came (canonical.md, A refusal names bytes), beside code and detail.
const named = (text, list) => { const hash = sha256(Buffer.from(typeof text === 'string' ? text : '', 'utf8')); return list.map(f => ({ hash, code: f.code, detail: f.detail || '' })); };
// strict_text: a block as TEXT, what its bytes alone say (checks 1 to 4). The two limits are read on the bytes first (size_limit, nothing else read); then the bytes
// must be the canonical bytes of a strict value (not_canonical); then the values. A refusal names the bytes: its hash is the SHA-256 of the bytes as they came.
function strictText(text) {
  if (typeof text !== 'string') throw argError('a block as text is text');
  let d = 0, most = 0, inStr = false;
  for (let j = 0; j < text.length; j++) { const c = text[j]; if (inStr) { if (c === '\\') j++; else if (c === '"') inStr = false; } else if (c === '"') inStr = true; else if (c === '[' || c === '{') most = Math.max(most, ++d); else if (c === ']' || c === '}') d = Math.max(0, d - 1); }
  if (Buffer.byteLength(text, 'utf8') > P.limits.block_bytes || most > P.limits.depth) return named(text, [{ code: 'size_limit', detail: 'its bytes are over limits.block_bytes or open more than limits.depth levels' }]);
  const r = wireParse(text);
  if (!r.ok) return named(text, [{ code: 'not_canonical', detail: r.why }]);
  // 1.9 3a (decided, CORE-SET "What building changed"): strict_text is what the bytes alone say: the first three checks of `valid` (size, bytes, header); the values are `read`'s
  return named(text, inCodeOrder(validCheck(r.value, {})));
}

// A push read from its bytes (nodes.md, Push; 1.9 3a-8, 3a-9): every message, signed or not, holds only what strict writing allows (no float, no null, no whole number past 2^53 - 1); a push is exactly
// { messages, for }; `limits.push_bytes` and `limits.push_messages` are read on the bytes first, and a carrier deeper than `limits.read_depth` is refused whole before any block in it is read.
// The answer is one list per message, plus one field for a refusal of the whole push: { refused: { hash, code, detail }, messages: [] } or { messages: [[refusal, ...], ...] }
// (1.9 3a-9: `refused` is left out where the whole push is not refused; the one form has no null). The limits are 8 MiB and 1024 messages (3a-8). 1.9 3a-8: the whole
// push is refused as `size_limit` for a limit and as `not_canonical` for anything else (bytes, an extra or missing top key, a float, a null).
const PUSH_LIMITS = { push_bytes: P.limits.push_bytes, push_messages: P.limits.push_messages };
function strictPush(text) {
  if (typeof text !== 'string') throw argError('a push is JSON text');
  const refusedWhole = (code, detail) => ({ refused: named(text, [{ code, detail }])[0], messages: [] });
  if (Buffer.byteLength(text, 'utf8') > PUSH_LIMITS.push_bytes) return refusedWhole('size_limit', 'over limits.push_bytes');
  const r = wireParse(text);
  if (!r.ok) return refusedWhole(r.why === 'too deep' ? 'size_limit' : 'not_canonical', r.why);
  const v = r.value;
  if (!isObj(v) || !Array.isArray(v.messages) || Object.keys(v).some(k => k !== 'messages' && k !== 'for')) return refusedWhole('not_canonical', 'a push is exactly { messages, for }, `for` left out where it says nothing');
  if (v.messages.length > PUSH_LIMITS.push_messages) return refusedWhole('size_limit', 'over limits.push_messages');
  // the push is canonical whole, so the bytes of each block are the canonical bytes of its value, as they came
  return { messages: v.messages.map(m => (isObj(m) && 'block' in m ? strictText(jcs(m.block)) : [])) };
}

// ================================================================ blocks held, causal past (blocks.md)
// A block's causes: every block it names in refs, and the block it counts to (protocol.json causal_state).
const refIds = b => { const out = []; for (const v of Object.values(b.refs || {})) for (const x of asList(v)) if (isStr(x)) out.push(x); for (const k of P.causal_state) if (b.state && isStr(b.state[k])) out.push(b.state[k]); return out; };
// 1.9 3b-7: the ids a block's body names, what a block held and not read hides: each id in its refs, but not its line's own links (its author, the block before it, its key, `after`)
const namedIds = b => { const out = []; for (const [k, v] of Object.entries(b.refs || {})) if (!['author', 'prev', 'key', 'after'].includes(k)) for (const x of asList(v)) if (isStr(x)) out.push(x); return out; };
// What a block names for its meaning (protocol.json needs): refs.under, answers, updates, for, and by type its schema, the grant it passes on, the block it
// counts to, a grant's scope.on. `read` waits for these and `valid` for none of them: never its author or its prev (core.md, section 8). Ascending.
function needsOf(b) {
  const out = [];
  for (const path of [...P.needs.every, ...(tableEntry(P.needs, b.type) || [])]) {
    const [side, key] = path.split('.');
    const root = side === 'refs' ? b.refs : side === 'state' ? b.state : (isObj(b.state) ? b.state[side] : undefined); // `scope.on` is state.scope.on
    const v = isObj(root) ? root[key] : undefined;
    for (const x of asList(v)) if (isStr(x) && x !== '' && !out.includes(x)) out.push(x);
  }
  return out.sort(); // nodes.md, Push: needs ascending
}

// ================================================================ what a reader holds: valid, read, or kept as its header (core.md, section 8)
// An entry is a whole block { hash, type, state, refs, signature } or a block held by its header alone: { hash, state: { seq, audience: ['sealed'], skip? },
// refs: { author, prev }, keyId, header_signature } (no type). A block that is valid and not read is kept as its header (asHeader) and keeps its body out of reach of every
// fold (`_body` is for the pieces of another block only: a key grant that is valid brings its key in whether or not this reader can read it).
const bodyOf = e => (e && e.type !== undefined ? e : (e && e._body) || null);
const keyRefOf = e => (e.type === undefined ? e.keyId : e.refs.key);
function asHeader(b) {
  const h = { hash: b.hash, state: { seq: b.state.seq, audience: ['sealed'] }, refs: { author: b.refs.author, prev: b.refs.prev }, header_signature: b.signature };
  if (b.refs.key !== undefined) h.keyId = b.refs.key;
  for (const f of ['skip']) if (b.state[f] === true) h.state[f] = true;
  Object.defineProperty(h, '_body', { value: b, enumerable: false });
  return h;
}
// a sealed message { header, header_signature, envelope? } as the entry it is held as: a header and its signature, nothing more.
// GUESS: [S2-13] a held header of a key grant that shows its own key (shown_key) cannot be opened by that key, for the key is in the body: it is judged with the keys its pieces name alone.
function headerEntry(m) {
  const h = m && m.header;
  if (!isObj(h)) return null;
  const out = { hash: h.hash, state: { seq: h.seq, audience: ['sealed'] }, refs: { author: h.author, prev: h.prev } };
  if ('key' in h) out.keyId = h.key;
  for (const flag of ['skip']) if (flag in h) out.state[flag] = h[flag];
  if (Object.keys(h).some(k => !P.header.includes(k) && !P.header_optional.includes(k)) || P.header.some(k => !(k in h))) out.bad_header = true;
  if (m.header_signature !== undefined) out.header_signature = m.header_signature;
  return out;
}
// the entries of a list of blocks and sealed messages: a header that carries its body (kept as a header by an earlier reading) is that body again
function normEntries(list) {
  const out = [];
  for (const x of list || []) {
    if (!x) continue;
    if (x.type === undefined && x._body) out.push(x._body);
    else if (x.type === undefined && isObj(x.header) && x.state === undefined) { const e = headerEntry(x); if (e) out.push(e); }
    else if (x.hash && isObj(x.state) && isObj(x.refs)) out.push(x);
  }
  return out;
}
// by id, a whole block over a header of one hash (two halves of one block, never a duplicate; privacy.md)
function buildIdx(entries) {
  const idx = new Map();
  for (const e of entries) { const o = idx.get(e.hash); if (!o || (o.type === undefined && e.type !== undefined)) idx.set(e.hash, e); }
  return idx;
}
// A block's pieces (core.md, section 8, check 5): its author's genesis, the block its refs.key names, and that block's pieces. Nothing else. `lack` lists the ids not held
// with a body (ascending): a piece held only as its header names no key, so it is not held.
function piecesOf(e, idx) {
  const have = [], lack = new Set(), seen = new Set(), stack = [];
  const push = id => { if (isStr(id) && !seen.has(id)) { seen.add(id); stack.push(id); } };
  push(e.refs.author); push(keyRefOf(e));
  while (stack.length) {
    const id = stack.pop(), p = bodyOf(idx.get(id));
    if (!p) { lack.add(id); continue; }
    have.push(id);
    if (isGenesisBlock(p)) continue;
    push(p.refs && p.refs.author); push(p.refs && p.refs.key);
  }
  return { have, lack: [...lack].sort() };
}
// a held header's keys and values (core.md, section 8: shape)
function headerShape(e) {
  const bad = [];
  if (e.bad_header) bad.push('a header is exactly author, seq, prev and hash, with key or skip');
  if (!Number.isInteger(e.state.seq) || e.state.seq < 1) bad.push('seq');
  for (const [k, v] of [['author', e.refs.author], ['prev', e.refs.prev], ['hash', e.hash], ['key', e.keyId]]) if (v !== undefined || k !== 'key') { const p = idProblem(v); if (p) return [{ stage: 2, code: p === 'unknown_suite' ? 'unknown_suite' : 'chain', detail: 'header ' + k }]; }
  for (const f of ['skip']) if (f in e.state && e.state[f] !== true) bad.push(f);
  if (!isStr(e.header_signature)) bad.push('header_signature');
  return bad.length ? [{ stage: 2, code: 'chain', detail: 'a header: ' + bad.join(', ') }] : [];
}
// The signed bytes of an entry for a key of `suite`: a whole block's header (the hash in that suite), a held header as it stands (canonical JSON of the header as held).
const sigBytesOf = (x, suite) => (x.type === undefined ? Buffer.from(jcs(header(x)), 'utf8') : signedBytes(x, suite));
const sigOf = x => (x.type === undefined ? x.header_signature : x.signature);
const entryOpens = (x, key, suite) => isStr(sigOf(x)) && verifyBytes(sigBytesOf(x, suite), sigOf(x), key, suite);
// judge(e, ctx): `valid` for one entry: { stage, findings, needs }. ctx = { idx, memo, stack }. Checks 1 to 4 on the bytes and values, 5 the pieces (core.md, section 8, check 5: one
// not held, or held only as its header, is `unmet`; one held that waits on a suite makes the block wait the same, `unknown_suite`; one held and refused is `bad_piece`, final), 6 the
// key its pieces name opens the signature over the header. A ring of key grants has no pieces: it is cut at the first block met again.
function judge(e, ctx, top) {
  if (!top && ctx.memo.has(e.hash)) return ctx.memo.get(e.hash);
  if (ctx.stack.has(e.hash)) return { stage: 6, findings: [{ stage: 6, code: 'bad_signature', detail: 'a ring of pieces' }], needs: [] };
  ctx.stack.add(e.hash);
  const res = judgeNow(e, ctx);
  ctx.stack.delete(e.hash);
  if (!top) ctx.memo.set(e.hash, res);
  return res;
}
function judgeNow(e, ctx) {
  const full = e.type !== undefined, found = (stage, list, needs) => ({ stage, findings: list.map(f => ({ stage, ...f })), needs: needs || [] });
  const first = list => { const stage = Math.min(...list.map(f => f.stage)); return { stage, findings: list.filter(f => f.stage === stage), needs: [] }; };
  const b = full ? blockOnly(e) : null;
  const early = full ? validCheck(b, {}) : headerShape(e);
  if (early.length) return first(early);
  // a genesis has no pieces and opens with its own key over its own bytes (check 6)
  if (full && isGenesisBlock(b)) {
    const key = b.state.public_key_sign, w = [];
    // 1.9 3a-1: the id is the hash of the bytes in its key's suite: a wrong id is `bad_hash` alone, never with `bad_signature`. A key spelled no way a suite writes opens nothing (bad_signature).
    // 1.9 3a-1: a genesis that names a suite this reader does not know waits (unknown_suite); else its id is the hash of its bytes in its own suite (bad_hash), and then its own key opens it
    const ks = suiteOfKey(key), named = isStr(b.state.suite) ? b.state.suite : 'std';
    if (ks === null && !SUITES.includes(named)) return found(6, [{ code: 'unknown_suite', detail: 'a suite this reader does not know' }]);
    if (e.hash !== undefined && hashOfBlock(b, ks || named) !== e.hash) w.push({ code: 'bad_hash', detail: 'the id is not the hash of the canonical bytes in its key\'s suite' });
    else if (ks === null || !isStr(e.signature) || !verifyBlock(b, e.signature, key)) w.push({ code: 'bad_signature', detail: 'a genesis opens with its own key over its own bytes; a key spelled as no suite spells a key opens nothing' });
    return found(6, w);
  }
  const { have, lack } = piecesOf(e, ctx.idx);
  const refusedPieces = [], waits = [];
  for (const id of have) { const r = judge(bodyOf(ctx.idx.get(id)), ctx); if (r.findings.length) { if (r.findings.every(f => PAIR_CODES.includes(f.code))) { if (r.findings.some(f => f.code === 'unknown_suite')) waits.push(id); } else refusedPieces.push(id + ' (' + inCodeOrder(r.findings)[0].code + ')'); } }
  const w5 = [];
  if (lack.length) w5.push({ code: 'unmet', detail: 'pieces not held: ' + lack.join(', ') });
  if (refusedPieces.length) w5.push({ code: 'bad_piece', detail: 'a piece it rests on is refused: ' + refusedPieces.sort().join(', ') });
  if (waits.length) w5.push({ code: 'unknown_suite', detail: 'a piece waits on a suite this reader does not know: ' + waits.sort().join(', ') });
  if (w5.length) return found(5, w5, lack);
  const author = e.refs.author, kref = keyRefOf(e), bodyAt = { get: h => bodyOf(ctx.idx.get(h)) };
  if (kref !== undefined && !keyGrantOf(bodyAt.get(kref), author)) return found(6, [{ code: 'bad_signature', detail: 'refs.key is not a key grant of this author about this author' }]);
  const cands = resolveKeys(e, bodyAt);
  let unknown = false, hit = null;
  // 1.9 3a-1: an id that is not the hash of the bytes in the suite of any key its pieces name is `bad_hash` alone (a forged block never gets both codes)
  if (full && e.hash !== undefined) { const known = cands.filter(c => SUITES.includes(c.suite) && keyGrammar(c.suite).test(c.key)); if (known.length && known.length === cands.length && !known.some(c => hashOfBlock(b, c.suite) === e.hash)) return found(6, [{ code: 'bad_hash', detail: 'the id is not the hash of the canonical bytes in its key\'s suite' }]); }
  for (const c of cands) {
    if (!SUITES.includes(c.suite) || !keyGrammar(c.suite).test(c.key)) { unknown = true; continue; }
    if (!hit && entryOpens(e, c.key, c.suite)) hit = c;
  }
  // 1.9 3a-1: a place this reader cannot read brings in nothing and refuses nothing: `bad_signature` is given only when every place the pieces offer is one this reader can read
  if (!hit && !unknown && kref !== undefined) { const kgb = bodyAt.get(kref); if (kgb && isObj(kgb.state) && ((isStr(kgb.state.suite) && !SUITES.includes(kgb.state.suite)) || (Array.isArray(kgb.state.voices) && kgb.state.voices.some(v => isObj(v) && ((isStr(v.suite) && !SUITES.includes(v.suite)) || (isStr(v.key) && !(SUITES.includes(v.suite || 'std') && keyGrammar(v.suite || 'std').test(v.key)))))))) unknown = true; }
  if (!hit) return found(6, [{ code: unknown ? 'unknown_suite' : 'bad_signature', detail: unknown ? 'a key in a suite this reader does not know' : 'no key its pieces name opens the signature over its header' }]);
  // the signature is read over the header that names the block by the id a reader computes, never one it was sent (core.md, section 1); an id sent that is not that id is `bad_hash`
  if (full && e.hash !== undefined && hashOfBlock(b, hit.suite) !== e.hash) return found(6, [{ code: 'bad_hash', detail: 'the id is not the hash of the canonical bytes in its key\'s suite' }]);
  return { stage: 0, findings: [], needs: [] };
}
// the schema store of whole blocks: every thing of kind schema, once per id (core.md, section 8)
// 1.9 stage 7 (1.8 B1; things.md, Schemas): the fields a schema declares, as [name, spec]: `fields` is an object { name: spec } or a list of `name:spec` lines. A spec is a shape word (text, hash, id, time, date,
// duration, decimal, amount, count) or `in:` and a comma list, a trailing `!` asking for the field; any other spec is a hint for people and checks nothing. 1.9-GUESS [7-3]: `in:a,b,c` (one comma-separated list).
const schemaFieldSpecs = sch => {
  const f = sch && sch.state && sch.state.fields;
  if (isObj(f)) return Object.entries(f).map(([k, v]) => [k, isStr(v) ? v : '']);
  if (Array.isArray(f)) return f.filter(isStr).map(l => { const i = l.indexOf(':'); return i < 0 ? [l, ''] : [l.slice(0, i), l.slice(i + 1)]; });
  return [];
};
const SHAPE_WORDS = ['text', 'hash', 'id', 'time', 'date', 'duration', 'decimal', 'amount', 'count'];
function typedFieldFindings(state, sch) {
  const out = [];
  for (const [name, spec0] of schemaFieldSpecs(sch)) {
    const asked = spec0.endsWith('!'), spec = asked ? spec0.slice(0, -1) : spec0;
    if (!SHAPE_WORDS.includes(spec) && !spec.startsWith('in:')) continue;
    const v = name.split('.').reduce((o, k) => (isObj(o) && k in o ? o[k] : undefined), state);
    if (v === undefined) { if (asked) out.push({ stage: 2, code: 'required', detail: 'state.' + name + ' is asked for by the schema it names' }); continue; }
    const ok = spec === 'text' ? isStr(v) : spec === 'hash' ? isStr(v) && RX.hash.test(v) : spec === 'id' ? isStr(v) && RX.id.test(v) : spec === 'time' ? isStr(v) && timeProblem(v) === null
      : spec === 'date' ? dateProblem(v) === null : spec === 'duration' ? isStr(v) && !!parseDur(v) : spec === 'decimal' ? isStr(v) && RX.decimal.test(v)
      : spec === 'amount' ? amountProblem(v) === null : spec === 'count' ? Number.isInteger(v) && v >= 1 : isStr(v) && spec.slice(3).split(',').includes(v);
    if (!ok) out.push({ stage: 2, code: 'shape', detail: 'state.' + name + ' is not ' + spec + ', as the schema it names says' });
  }
  return out;
}
const schemasMap = list => new Map(list.filter(b => isObj(b) && b.type === 'thing' && isObj(b.state) && b.state.kind === 'schema' && isStr(b.hash)).map(b => [b.hash, b]));
// read(b): the codes of one valid block against what is held and read (core.md, section 8): names_missing, names_unread (naming the ids in the detail; `needs` gives them), then check 7.
function readCodes(b, st) {
  const miss = [], unread = [], out = [];
  for (const id of needsOf(b)) { if (!st.idx.has(id)) miss.push(id); else if (!(st.validE.has(id) && st.status.get(id) === 'read')) unread.push(id); }
  if (miss.length) out.push({ stage: 0, code: 'names_missing', detail: 'not held: ' + miss.join(', ') });
  if (unread.length) out.push({ stage: 0, code: 'names_unread', detail: 'held and not valid or not read: ' + unread.join(', ') });
  // 1.9 3a-1: every judgement of a value is `read`'s: the codes that left `valid` (the grammar and shape of every value, in any type, a genesis's own values, the audience, the date)
  for (const f of valueCheck(blockOnly(b), {})) out.push({ stage: f.stage, code: f.code, detail: f.detail });
  if (CLOSED.has(b.type) && !readsAsGenesis(b)) closedFindings(blockOnly(b), { held: st.bodies, schemas: st.schemas }, (stage, code, detail) => out.push({ stage, code, detail }));
  // 1.9 stage 7 (1.8 B1): a block of any type that names a schema it holds, and carries a field the schema types in another shape (or lacks one it asks for), is not read (`shape`, `required`)
  { const sch = isObj(b.refs) && isStr(b.refs.schema) && st.schemas ? st.schemas.get(b.refs.schema) : undefined; if (sch && isObj(b.state)) for (const f of typedFieldFindings(b.state, sch)) out.push(f); }
  // 1.9 3a-13: `state.rule_set` is a field of every type; this reader runs no rule set, so a block that states one is not read (`unknown_rules`)
  if (isObj(b.state) && b.state.rule_set !== undefined && !RUNS.includes(b.state.rule_set)) out.push({ stage: 9, code: 'unknown_rules', detail: 'state.rule_set names a set this reader does not run' });
  return inReadOrder(out);
}
// Which entries are valid, and of those which are read (to a fixed point: a block that names one not read is not read). Returns { idx, validE, status, codes, m }, `m` what a fold
// reads: a block read whole, a block not read as its header.
function classify(entries, opts) {
  const idx = buildIdx(entries), ctx = { idx, memo: new Map(), stack: new Set() };
  const validE = new Map();
  for (const e of idx.values()) if (!judge(e, ctx).findings.length) validE.set(e.hash, e);
  const whole = [...validE.values()].filter(e => e.type !== undefined);
  const bodies = new Map(whole.map(e => [e.hash, e]));
  const st = { idx, validE, bodies, schemas: (opts && opts.schemas) || schemasMap(whole), status: new Map() };
  for (const e of validE.values()) st.status.set(e.hash, e.type !== undefined ? 'read' : 'unread');
  const codes = new Map();
  for (let again = true; again;) {
    again = false;
    for (const e of whole) if (st.status.get(e.hash) === 'read') { const c = readCodes(e, st); if (c.length) { st.status.set(e.hash, 'unread'); codes.set(e.hash, c); again = true; } }
  }
  const m = new Map();
  for (const e of validE.values()) m.set(e.hash, st.status.get(e.hash) === 'read' || e.type === undefined ? e : asHeader(e));
  return { idx, validE, status: st.status, codes, m, ctx };
}
// A reader's pool: the blocks it holds that are valid, each read whole or, when not read, kept as its header (a fold reads headers of the one and bodies of the other).
// `open` reads the entries as given with no judgement (a chain is read as given: its gaps are what it reports).
class Pool {
  constructor(blocks, open) {
    const entries = normEntries(blocks);
    this.memo = new Map(); this.folds = new Map();
    if (open) { this.m = new Map(entries.map(e => [e.hash, e])); this.status = null; return; }
    const r = classify(entries);
    this.m = r.m; this.status = r.status; this.unreadCodes = r.codes;
    // 1.9 3a-4: a block held with its body that this reader cannot judge yet (a piece not held, a suite it does not know) is no part of any fold; a fold asked about what its body names answers not_shown
    this.unjudged = [...r.idx.values()].filter(e => e.type !== undefined && !r.validE.has(e.hash) && judge(e, r.ctx).findings.length && judge(e, r.ctx).findings.every(f => PAIR_CODES.includes(f.code)));
  }
  get(h) { return this.m.get(h); }
  // the body of a block held, a block kept as its header too: for the pieces of another block alone (core.md, section 8)
  body(h) { return bodyOf(this.m.get(h)); }
  all() { return [...this.m.values()]; }
  // the causal past: every block reachable through refs (not the block itself)
  past(h) {
    if (this.memo.has(h)) return this.memo.get(h);
    const seen = new Set(), stack = [h];
    this.memo.set(h, seen); // cycles cannot happen in sound data; guard anyway
    while (stack.length) { const b = this.m.get(stack.pop()); if (!b) continue; for (const r of refIds(b)) if (!seen.has(r)) { seen.add(r); stack.push(r); } }
    return seen;
  }
  sees(a, b) { return this.past(a).has(b); } // b is in a's causal past
  // the causal past as a set of its own, without the block itself: the blocks a fold of "what the block could see" reads
  before(h) { const s = new Set(this.past(h)); s.delete(h); return s; }
  forget() { this.folds = new Map(); this.memo = new Map(); this._eq = null; this._sg = null; this.keepViews = null; this._cl = null; }
  // whether a stop or close counts for a block relying on a grant (a death or stop ends it from the block that sees it on); with no block, every one held
  seenBy(relying) { if (!relying) return () => true; const past = this.past(relying.hash); return h => past.has(h) && h !== relying.hash; }
}
// quorum(voices, needed): N different voices agree. `needed` is the number the rule's author stated; with none (null) nothing holds, no count is
// filled in (each caller reads its own `needed`, and keeps its own fallback visible there)
const quorum = (voices, needed) => needed !== null && new Set(voices).size >= needed;
// earliest(set): the causal minima of a set of blocks, by lowest hash. Of several, all are reported; the lowest hash only names one (folds.md)
const earliest = (list, pool) => list.filter(x => !list.some(y => y !== x && pool.sees(x.hash, y.hash))).sort(byHash);
// latest(set): the causal maxima, the blocks no other of the set sees
const latest = (list, pool) => list.filter(x => !list.some(y => y !== x && pool.sees(y.hash, x.hash)));
const poolOf = x => x instanceof Pool ? x : new Pool(x);
const blockOnly = b => { const o = {}; for (const k of ['type', 'state', 'refs']) if (k in b) o[k] = b[k]; return o; };

// ================================================================ a block's id (core.md, section 2)
// The suite a block shows by itself, a reader's guess that `valid` never uses (door op id_of): a genesis names its own; any other block is hashed as the key it names was
// brought in, so the hash name of its refs.key, else of its refs.author (a bare hash is SHA-256, which std names).
function suiteFromBlock(b) {
  if (b.type === 'actor' && b.refs && b.refs.author === undefined) return SUITES.includes(b.state && b.state.suite) ? b.state.suite : 'std';
  const named = b.refs && (isStr(b.refs.key) ? b.refs.key : b.refs.author);
  return isStr(named) && named.startsWith('sm3:') ? 'sm' : 'std';
}
// The suite of the key that signed a block: a genesis's own; else the key its pieces name that opens its signature over its header. null when none does.
function signedSuite(b, pool) {
  if (b.type === 'actor' && b.refs && b.refs.author === undefined) return suiteFromBlock(b);
  if (!isStr(b.refs && b.refs.author)) return null;
  const s = signerFrom(b, pool);
  return s ? s.suite : null;
}
// A block's id: the hash of its canonical bytes in the suite of the key its pieces name, read among held; else in the suite the block shows.
function idOf(b, held) {
  const suite = (held ? signedSuite(b, poolOf(held)) : null) || suiteFromBlock(b);
  return hashOfBlock(blockOnly(b), suite);
}

// ================================================================ who signed a block, read from what it rests on alone (core.md, sections 5 and 8; identity.md, refs.key)
// A genesis that opens with its own key.
const soundGenesis = g => !!g && g.type === 'actor' && g.refs.author === undefined && isStr(g.state.public_key_sign) && (!Array.isArray(g.state.voices) || g.state.voices.some(v => isObj(v) && v.key === g.state.public_key_sign)) && g.state.seq === undefined && isStr(g.signature) && verifyBytes(Buffer.from(canonOf(g), 'utf8'), g.signature, g.state.public_key_sign, g.state.suite || 'std');
// autonomous(id, pool): an autonomous system is an actor of kind agent or machine (identity.md, consent.md)
const autonomous = (id, pool) => { const g = pool.get(id); return !!g && ['agent', 'machine'].includes(g.state.kind); };
const isKeyGrant = b => b.type === 'grant' && b.state && b.state.kind === 'key';
// a key grant about the identity: `refs.subject` her id, no status (a block with a status is a stop or an answer, never a grant: authority.md)
const keyGrantOf = (b, id) => !!b && isKeyGrant(b) && b.refs.subject === id && b.state.status === undefined;
// identity.md, Her voices: the suite's hash of a key's SPKI hex as UTF-8 text
const keyHash = (spki, suite) => hashStr(suite || 'std', spki);
const isZeroDur = d => { const p = parseDur(d); return !!p && Object.values(p).every(n => n === 0); };
// The list a block states (identity.md, Her voices): the genesis (a list of one voice, its own key) or a key grant that states `voices`.
function listOfBlock(b, id) {
  if (!b) return null;
  if (b.hash === id && soundGenesis(b) && Array.isArray(b.state.voices)) return { hash: id, voices: b.state.voices, clocks: b.state.clocks !== undefined ? b.state.clocks : null }; // 1.9 3d-17: a genesis may state her whole list
  if (b.hash === id) return soundGenesis(b) ? { hash: id, voices: [{ key: b.state.public_key_sign, ...(b.state.suite !== undefined ? { suite: b.state.suite } : {}), ...(b.state.reach !== undefined ? { reach: b.state.reach } : {}) }], clocks: b.state.clocks !== undefined ? b.state.clocks : null } : null;
  if (keyGrantOf(b, id) && Array.isArray(b.state.voices)) return { hash: b.hash, voices: b.state.voices, clocks: b.state.clocks !== undefined ? b.state.clocks : null };
  return null;
}
// the key_hash voice of a list that a key hashes to (its suite's hash of the SPKI hex), or undefined
// 1.9 3d-12: a hidden voice `{ key_hash }` names a key by the hash of its SPKI text with no `suite` field: the hash name says which hash (`sm3:` is the sm hash, a bare 64 hex is std); the key shows its own suite
const hashNamesKey = (hashName, spki) => isStr(hashName) && isStr(spki) && keyHash(spki, hashName.startsWith('sm3:') ? 'sm' : 'std') === hashName;
const matchHash = (list, key) => (list ? list.voices.find(v => isObj(v) && isStr(v.key_hash) && isStr(key) && hashNamesKey(v.key_hash, key)) : undefined);
// The keys a block brings in for an author (core.md, section 5; protocol: 00-shared, refs.key): the genesis's own; each `key` voice of the list a key grant states;
// the one `public_key_sign` a key grant adds under a voice. (A key named by hash comes in by showing itself: resolveKeys.)
function keysBroughtBy(p, author) {
  if (!p) return [];
  if (p.hash === author) return soundGenesis(p) ? (Array.isArray(p.state.voices) ? p.state.voices.filter(v => isObj(v) && isStr(v.key)).map(v => ({ key: v.key, suite: v.suite || 'std' })) : [{ key: p.state.public_key_sign, suite: p.state.suite || 'std' }]) : [];
  if (!keyGrantOf(p, author)) return [];
  const out = [];
  if (Array.isArray(p.state.voices)) { for (const v of p.state.voices) if (isObj(v) && isStr(v.key)) out.push({ key: v.key, suite: v.suite || 'std' }); }
  else if (isStr(p.state.public_key_sign)) out.push({ key: p.state.public_key_sign, suite: p.state.suite || 'std' });
  return out;
}
// The keys a block's refs.key makes candidates for its signature (identity.md, refs.key): with no refs.key, the author's genesis key; else the keys of the key
// grant it names: each key voice of its list, the one key it adds under a voice, and the key a hash voice shows. A key named by hash speaks first in the key
// grant that shows it, which names in refs.key the list that holds the hash; its later blocks name that showing key grant.
function resolveKeys(b, pool) {
  const author = b.refs.author, kref = keyRefOf(b), at = h => (pool.body ? pool.body(h) : pool.get(h));
  if (kref === undefined) { const root = at(author); return soundGenesis(root) ? keysBroughtBy(root, author) : []; }
  const kg = at(kref);
  if (!kg || !keyGrantOf(kg, author)) return [];
  const out = keysBroughtBy(kg, author);
  // the block itself shows the key: a key grant stating shown_key, whose refs.key names the list that holds the key's hash
  if (isKeyGrant(b) && isStr(b.state.shown_key)) { const hv = matchHash(listOfBlock(kg, author), b.state.shown_key); if (hv) out.push({ key: b.state.shown_key, suite: suiteOfKey(b.state.shown_key) || 'std' }); }
  // a later block of a shown key names the key grant that showed it: the key stated in its shown_key, when that grant's own refs.key names a list with the hash
  if (isStr(kg.state.shown_key)) { const hv = matchHash(listOfBlock(at(kg.refs.key), author), kg.state.shown_key); if (hv) out.push({ key: kg.state.shown_key, suite: suiteOfKey(kg.state.shown_key) || 'std' }); }
  return out;
}
// The signer of a block: { key, suite } read from what its pieces name alone (refs.key, or the genesis key), the key that opens its signature over its header (a held header's
// too: the header carries `key`); null when none does. It reads no prev and no seq: where the block sits on its line is the line's question. Cached for a block of the pool.
function signerFrom(b, pool) {
  // a block whose state or refs is not an object is refused by its bytes (core.md, check 1) and has no signer to read
  if (!isObj(b.state) || !isObj(b.refs) || !isStr(b.refs.author)) return null;
  pool._sg = pool._sg || new Map();
  const mine = pool.get(b.hash) === b;
  if (mine && pool._sg.has(b.hash)) return pool._sg.get(b.hash);
  const open = resolveKeys(b, pool).find(c => SUITES.includes(c.suite) && entryOpens(b, c.key, c.suite));
  const out = open ? { key: open.key, suite: open.suite } : null;
  if (mine) pool._sg.set(b.hash, out);
  return out;
}

// ================================================================ the identity fold (identity.md; blocks.md, Finality)
// One pass in causal order, read lazily: for each block, the list standing in its causal past; whether its key is a voice of that list or under one; whether an
// end has reached it (The cut). A block counts (`signed_by_author`) when a key of a standing voice (or a key under one) signed it and no end of the key has reached it;
// that a word WAITS (does not yet stand) is `stands`, and a waiting block is still true here.
const lastOf = a => a[a.length - 1];
const jOf = x => (x === undefined || x === null ? 'null' : jcs(x));
function emptyIdentity() { return { signed_by_author: {}, keys: [], voices: [], clocks: null, waiting: [], info: new Map(), keyMap: new Map(), timeline: [], genKey: null, idSuite: 'std', closed: false, kgStands: null, twiceOf: null, reachOf: null, witnessGrantStands: null, endsOfKey: null }; }
function identityFold(id, poolIn) {
  const pool = poolOf(poolIn);
  const key = 'id:' + id;
  if (pool.folds.has(key)) return pool.folds.get(key);
  const res = computeIdentity(id, pool);
  pool.folds.set(key, res);
  return res;
}
function computeIdentity(id, pool) {
  const g = pool.get(id);
  if (!g || g.type !== 'actor' || g.refs.author !== undefined || !isStr(g.state.public_key_sign)) return emptyIdentity();
  const genKey = g.state.public_key_sign, idSuite = g.state.suite || 'std';
  const all = pool.all();
  let joinIdx = null;
  const authored = all.filter(b => b.refs.author === id && b.hash !== id);
  const authoredSet = new Set(authored.map(b => b.hash));
  const kgs = all.filter(b => keyGrantOf(b, id));
  const lists = kgs.filter(k => Array.isArray(k.state.voices));
  const unders = kgs.filter(k => !Array.isArray(k.state.voices) && isStr(k.state.public_key_sign));
  const byUpdates = new Map();
  for (const k of lists) { const u = k.refs.updates; if (!byUpdates.has(u)) byUpdates.set(u, []); byUpdates.get(u).push(k); }
  const genesisList = listOfBlock(g, id);
  const info = new Map();
  for (const b of authored) { const s = signerFrom(b, pool); if (s) info.set(b.hash, s); }
  const pastOf = h => pool.past(h);
  const inS = (S, h) => S === null || S.has(h);
  const sKey = S => (S === null ? 'all' : S);
  const memo = { counted: new Map(), chain: new Map(), kg: new Map(), sg: new Map(), twice: new Map() };
  const self = { genKey, idSuite, info };
  const idOf = a => (a === id ? self.fold : identityFold(a, pool));
  // whether a block counts for its own author: read in the author's own fold
  const countedBy = b => (b.refs.author === id ? cb(b.hash) : (isStr(b.refs.author) ? idOf(b.refs.author).signed_by_author[b.hash] === true : true));
  const hasKey = (list, X) => list.voices.some(v => isObj(v) && (v.key === X || (isStr(v.key_hash) && hashNamesKey(v.key_hash, X))));
  const keyAt = (v, X) => isObj(v) && (v.key === X || (isStr(v.key_hash) && hashNamesKey(v.key_hash, X)));

  // ---- the standing list: the chain of lists from the genesis, each by a key grant that stands in what is read (null: all held)
  function chain(S) {
    const mk = sKey(S);
    if (memo.chain.has(mk)) return memo.chain.get(mk);
    const out = [{ list: genesisList, via: null }];
    memo.chain.set(mk, out); // a loop reads what is built so far
    for (let guard = 0; guard < 64; guard++) {
      const cur = lastOf(out).list;
      const cands = (byUpdates.get(cur.hash) || []).filter(k => inS(S, k.hash) && kgStands(k, S).stands).map(k => ({ k, sg: kgSigner(k) })).filter(x => x.sg).sort((a, b) => a.sg.p - b.sg.p);
      if (!cands.length) break;
      // two standing key grants that replace one list: the higher voice's is the list; of one place, neither (identity.md, One list at a time)
      if (cands.length > 1 && cands[0].sg.p === cands[1].sg.p) break;
      out.push({ list: listOfBlock(cands[0].k, id), via: cands[0].k });
    }
    return out;
  }
  const standing = S => lastOf(chain(S)).list;
  // a key's place in a list: { p } for a key of a voice (a shown hash too), { p, under } for a key under a voice
  function placeOfKey(X, L, S) {
    for (let i = 0; i < L.voices.length; i++) if (keyAt(L.voices[i], X)) return { p: i };
    for (const U of unders) {
      if (U.state.public_key_sign !== X || !inS(S, U.hash)) continue;
      const p0 = underPlace(U, S);
      if (p0 !== null) return { p: p0, under: true };
    }
    return null;
  }
  // a key under a voice speaks while its voice does (identity.md, A key under a voice): the place of its voice, or null when it stands no more
  function underPlace(U, S) {
    if (!kgStands(U, S).stands) return null;
    const sg = kgSigner(U);
    if (!sg || sg.kind !== 'key') return null;
    const ch = chain(S), LU = standing(pastOf(U.hash));
    const iU = ch.findIndex(c => c.list.hash === LU.hash);
    if (iU < 0) return null;
    let Xv = sg.X;
    for (let j = iU + 1; j < ch.length; j++) {
      const v = ch[j].list.voices[sg.p];
      if (keyAt(v, Xv)) continue;
      // the key of its voice is ended: it ends too, unless the block that added it is inside that cut; it is then under the key put in that place
      if (!v || !pastOf(ch[j].via.hash).has(U.hash)) return null;
      Xv = isStr(v.key) ? v.key : Xv;
    }
    // a stop of the key grant that added it, by its signer or a voice above
    for (const st of all) {
      if (st.refs.updates !== U.hash || st.state.status !== 'stopped' || st.refs.author !== id || !inS(S, st.hash) || !cb(st.hash)) continue;
      const s2 = info.get(st.hash), pl = s2 && placeOfKey(s2.key, standing(pastOf(st.hash)), pastOf(st.hash));
      if (pl && !pl.under && pl.p <= sg.p) return null;
    }
    return sg.p;
  }
  // ---- who signed a key grant, as which voice of the list standing in its own past: { p, kind: key | names, X, voice }
  function kgSigner(k) {
    if (memo.sg.has(k.hash)) return memo.sg.get(k.hash);
    memo.sg.set(k.hash, null);
    const Kp = pastOf(k.hash), Lk = standing(Kp);
    let r = null;
    if (k.refs.author === id) {
      const s = info.get(k.hash);
      if (s && cb(k.hash)) { const pl = placeOfKey(s.key, Lk, Kp); if (pl && !pl.under) r = { p: pl.p, kind: 'key', X: s.key, voice: Lk.voices[pl.p] }; }
    } else if (isStr(k.refs.author) && k.refs.author !== id && idOf(k.refs.author).signed_by_author[k.hash] === true) {
      const P_ = k.refs.author, i = Lk.voices.findIndex(v => isObj(v) && Array.isArray(v.names) && v.names.includes(P_));
      if (i >= 0) r = { p: i, kind: 'names', X: null, voice: Lk.voices[i] };
    }
    memo.sg.set(k.hash, r);
    return r;
  }
  // ---- does a block count for its author (signed_by_author)
  // cb: the base count the chain of lists is built from (the key is a voice of the list standing in the block's causal past, or under one); counted adds the cuts that
  // read the chain whole (a suite move; an end a clock's line held before her receipt of the block), so the chain never reads its own cuts
  function cb(h) {
    if (memo.counted.has(h)) return memo.counted.get(h);
    memo.counted.set(h, false); // a loop counts for nothing
    const r = countedNow(pool.get(h));
    memo.counted.set(h, r);
    return r;
  }
  function counted(h) {
    if (!cb(h)) return false;
    const b = pool.get(h), s = info.get(h);
    // a suite move (identity.md): a key grant that puts a key of another suite in the old key's place cuts by causal order alone: a block of the old key counts only when
    // that key grant has it in its causal past. No clock and no reach is read, and nothing another built on is kept.
    // 1.9 3d-12: to a reader who believes the old suite a suite move is an end, read as any end is (below). 1.9-GUESS [3d-12]: a reader who no longer believes a suite is not representable in the door (no argument names a belief): not built
    // an end of its key that stands among the blocks held and that it has seen (blocks.md, The cut, Seen)
    const clock = clocksOf(reachClock(b));
    // 1.9 3d-8: a key grant by her voice above the key whose `counted_to` is before the block puts it off her line toward every block that does not have it in its past (question 5): it counts for no block that has not built on it
    if (keyEnds(b).some(E => cutByCountedTo(b, E))) return false;
    // an end that names in `counted_to` a block that is this one or has it in its past says this block counts (question 5): it is not cut by that end
    // and (blocks.md, The cut; CORE-SET 3d-9) a block counts as made on the word where the end has it in its past, whatever a clock shows
    // (end pass 2026-11-20, as the core reads it)
    const countsBy = E => (isStr(E.state.counted_to) && (E.state.counted_to === b.hash || pastOf(E.state.counted_to).has(b.hash))) || pastOf(E.hash).has(b.hash);
    // 1.9 3d-8 (Her own word stands alone): a block joined to no other person's block stands against her own voices' ends when signed; only a
    // `counted_to` before it (above) puts it off her line (end pass 2026-11-20, as the core reads it)
    // (read without asking whether each joiner counts, which would ask this block again: a block no other person's block names at all, and
    // that names none, is joined to none)
    // (an end in its own causal past it has seen, and is cut by, alone or not)
    if (!joinedToOther(b)) return !keyEnds(b).some(E => !countsBy(E) && !asList(b.refs.confirms).includes(E.hash) && pastOf(b.hash).has(E.hash));
    return !keyEnds(b).some(E => !countsBy(E) && seenEnd(b, E, clock));
  }
  // whether another person's block names b, or b names one (a receipt or a cutoff joins no one), read once for every block of the pool
  function joinedToOther(b) {
    if (joinIdx === null) {
      joinIdx = { by: new Map(), names: new Map() };
      for (const o of all) {
        if (!isStr(o.refs.author) || (o.type === 'observe' && (o.state.kind === 'receipt' || o.state.kind === 'cutoff'))) continue;
        joinIdx.by.set(o.hash, o);
        for (const x of joinRefs(o)) { if (!joinIdx.names.has(x)) joinIdx.names.set(x, []); joinIdx.names.get(x).push(o); }
      }
    }
    if ((joinIdx.names.get(b.hash) || []).some(o => o.hash !== b.hash && o.refs.author !== b.refs.author)) return true;
    return joinRefs(b).some(x => { const o = joinIdx.by.get(x); return !!o && o.hash !== b.hash && o.refs.author !== b.refs.author; });
  }
  function cutByCountedTo(b, E) {
    if (!isStr(E.state.counted_to)) return false;
    const c = pool.get(E.state.counted_to), s = info.get(b.hash);
    if (!c || !s || c.hash === b.hash || c.refs.author !== b.refs.author || pastOf(c.hash).has(b.hash) || joinersOf(b).length) return false; // 1.9-GUESS [3d-8]: `counted_to` names a block of hers (of that key, or of the voice above that stood where the key began)
    const sg = kgSigner(E), Le = standing(pastOf(E.hash)), pl = placeOfKey(s.key, Le, pastOf(E.hash));
    return !!sg && !!pl && sg.p < pl.p;
  }
  function countedNow(b) {
    const s = info.get(b.hash);
    if (!s) return false;
    const S = pastOf(b.hash), L = standing(S);
    if (L.voices.length === 0) return false; // a list with no voice left closes her identity: nothing signed after it counts
    const pl = placeOfKey(s.key, L, S);
    if (!pl) return false;
    if (pl.under && isKeyGrant(b)) return false; // a key under a voice signs no key grant
    return true;
  }
  // the standing key grants that leave a key out of the list (an end of the key: The cut)
  function endsOfKey(X, S) {
    const ch = chain(S), out = [];
    for (let i = 1; i < ch.length; i++) if (hasKey(ch[i - 1].list, X) && !hasKey(ch[i].list, X)) out.push(ch[i].via);
    return out;
  }
  // ---- the clock: lines, receipts, cutoffs (blocks.md, A named clock)
  const lineCache = new Map();
  function lineSpec(n) {
    if (lineCache.has(n)) return lineCache.get(n);
    const B = pool.get(n);
    let spec = null;
    if (B && B.type === 'actor' && B.refs.author === undefined && soundGenesis(B)) spec = { author: B.hash, key: null, after: 0 }; // 1.9 3d-3: a person's id names her line, whatever key of her list signs: on_line follows her list
    // a key grant that brings in one key (a key under a voice) names that key's line, whole; any other block, its own key's blocks after it
    else if (B && isKeyGrant(B) && !Array.isArray(B.state.voices) && isStr(B.state.public_key_sign) && isStr(B.refs.subject)) spec = { author: B.refs.subject, key: B.state.public_key_sign, after: 0 };
    else if (B && isStr(B.refs.author) && Number.isInteger(B.state.seq)) { const s = signerFrom(B, pool); if (s) spec = { author: B.refs.author, key: s.key, after: B.state.seq }; }
    lineCache.set(n, spec);
    return spec;
  }
  // a clock's line: that block's key's blocks after it, counted, by seq, read in S (null: all held)
  function lineBlocks(n, S) {
    const spec = lineSpec(n);
    if (!spec) return [];
    return all.filter(x => x.refs.author === spec.author && x.hash !== n && Number.isInteger(x.state.seq) && x.state.seq > spec.after && inS(S, x.hash) && (() => { if (spec.key === null) return true; const s = signerFrom(x, pool); return !!s && s.key === spec.key; })() && (spec.author === id ? cb(x.hash) : idOf(spec.author).signed_by_author[x.hash] === true))
      .sort((a, b) => pastOf(a.hash).size - pastOf(b.hash).size || cmp(a.hash, b.hash)); // 1.9 3b-4: a line is read in its own causal order
  }
  const receiptOn = (line, h) => line.find(x => x.type === 'observe' && x.state.kind === 'receipt' && asList(x.refs.derives_from).includes(h));
  const receiptsOf = (line, h) => line.filter(x => x.type === 'observe' && x.state.kind === 'receipt' && asList(x.refs.derives_from).includes(h));
  const placedEarlier = (x, y) => x !== y && pastOf(y.hash).has(x.hash); // 1.9 3b-4: a receipt is before another where the other has it in its causal past; its `at` orders nothing
  // 1.9 3d-5, 3d-6: what one line says of a block `b` and an end `E` (null: an end that may yet come): 'passes' (a receipt of b before every receipt of E), 'after' (a receipt of E before a receipt of b, or a receipt of E and none of b), or null.
  // One receipt that names an end and a block shows neither before nor after (D-also); a later receipt of the block on that line is after the end.
  function lineSays(line, b, E) {
    const rb = receiptsOf(line, b.hash), re = E ? receiptsOf(line, E.hash) : [];
    for (const r of rb) {
      if (re.includes(r)) continue; // a tie: neutral
      if (re.some(e => placedEarlier(e, r))) return 'after';
      if (re.every(e => placedEarlier(r, e))) return 'passes';
    }
    return !rb.length && re.length ? 'after' : null;
  }
  // on a clock, `needed` lines must show the reading that widens what a word allows (a block in time, a wait run, a reach run, an end passed); the other reading takes `names` less `needed`, plus one. They never both hold.
  function clockSays(clock, b, E, S) {
    let passes = 0, after = 0;
    for (const n of clock.names) { const v = lineSays(lineBlocks(n, S === undefined ? null : S), b, E); if (v === 'passes') passes++; else if (v === 'after') after++; }
    return { passed: passes >= clock.needed, seen: after >= clock.names.length - clock.needed + 1 };
  }
  // a wait has run (blocks.md, A named clock, 1.9 3d-4): `needed` lines each hold her receipt of the word and, after it on the line, a cutoff of the span that runs from that receipt (`refs.derives_from` the receipt, `refs.subject` the word).
  // A cutoff's place is its time; no date is added to a date. 'denied' when `names` less `needed` plus one lines hold, before their closing cutoff, a receipt of a block that sets the word aside (a no, an end); else 'pending'.
  const readsOf = w => h => h === w.hash || (() => { const x = pool.get(h); return !!x && keyGrantOf(x, id); })();
  function waitRun(w, wait, clocks, S, blockers) {
    if (isZeroDur(wait)) return 'run';
    const ks = clocksOf(clocks);
    if (!ks) return 'pending';
    let closed = 0, denied = 0;
    for (const n of ks.names) {
      const line = lineBlocks(n, S), rs = receiptsOf(line, w.hash);
      let c = null;
      // 1.9 3d-4 (owner's ruling, 2026-11-19): a span cutoff states the span as its `when` (a duration, at least the wait: durations are compared, never added to a date) and runs from her receipt, or an earlier such cutoff
      const spanOk = x => isStr(x.state.when) && !!parseDur(x.state.when) && addDur('2000-01-01T00:00:00.000Z', x.state.when) >= addDur('2000-01-01T00:00:00.000Z', wait);
      const cuts = line.filter(x => x.type === 'observe' && x.state.kind === 'cutoff' && asList(x.refs.subject).includes(w.hash));
      const runsFrom = (x, seenC = new Set()) => { if (seenC.has(x.hash)) return false; seenC.add(x.hash); return asList(x.refs.derives_from).some(h => rs.some(r => r.hash === h) || cuts.some(e => e.hash === h && runsFrom(e, seenC))); };
      const closing = cuts.filter(x => spanOk(x) && rs.some(r => placedEarlier(r, x)) && runsFrom(x));
      c = closing.find(x => !closing.some(o => placedEarlier(o, x))) || null;
      if (!c) continue;
      if (line.some(x => placedEarlier(x, c) && x.type === 'observe' && x.state.kind === 'receipt' && asList(x.refs.derives_from).some(h => blockers.has(h)))) { denied++; continue; }
      closed++;
    }
    return closed >= ks.needed ? 'run' : denied >= ks.names.length - ks.needed + 1 ? 'denied' : 'pending';
  }
  const isCutoffOk = x => isStr(x.state.when) && timeProblem(x.state.when) === null && (x.state.at === undefined || (isStr(x.state.at) && x.state.at >= x.state.when)); // 1.9 3d-4: a cutoff whose own `at` is before its `when` closes nothing

  // a voice as a value to compare: who it is (key, key_hash, or names with needed), its suite (std when left out), its wait and its reach
  const voiceOf = v => (isObj(v) ? jcs({ who: isStr(v.key) ? ['key', v.key] : isStr(v.key_hash) ? ['hash', v.key_hash] : ['names', v.names, v.needed === undefined && Array.isArray(v.names) && v.names.length === 1 ? 1 : v.needed], suite: v.suite || 'std', wait: v.wait === undefined ? null : v.wait, reach: v.reach === undefined ? null : v.reach }) : 'none');
  const sameVoices = (a, b) => a.length === b.length && a.every((v, i) => voiceOf(v) === voiceOf(b[i]));
  // the place another's key grant (or confirm) for her list speaks from in L: the voice of named people its author is one of
  const placeOfOther = (x, L) => { const i = L.voices.findIndex(v => isObj(v) && Array.isArray(v.names) && v.names.includes(x.refs.author)); return i >= 0 ? i : null; };
  // the place a block of hers or for her list speaks from, in L: { p, under } (p -1 for her operator), or null
  const placeIn = (x, L) => { if (x.refs.author === id) { const s2 = info.get(x.hash), Px = pastOf(x.hash), pl = s2 && placeOfKey(s2.key, L, Px); return pl || null; } const p = placeOfOther(x, L); return p === null ? null : { p }; };
  // a voice above sg's place has signed w (named it in refs.confirms of a counted block): a higher voice of the list (for a key under a voice, its own voice
  // too), or named people `needed` of them
  function aboveSigned(w, sg, S) {
    const rank = sg.under ? sg.p + 1 : sg.p, ids = new Map();
    for (const c of all) {
      if (c.hash === w.hash || !asList(c.refs.confirms).includes(w.hash) || !inS(S, c.hash) || !countedBy(c)) continue;
      const Lc = standing(pastOf(c.hash)), pl = placeIn(c, Lc);
      if (!pl || pl.under || !(pl.p < rank)) continue;
      const v = pl.p >= 0 ? Lc.voices[pl.p] : null;
      if (!(isObj(v) && Array.isArray(v.names))) return true;
      if (!ids.has(pl.p)) ids.set(pl.p, new Set());
      ids.get(pl.p).add(c.refs.author);
      const need = Number.isInteger(v.needed) ? v.needed : (v.names.length === 1 ? 1 : null);
      if (need !== null && ids.get(pl.p).size >= need) return true;
    }
    return false;
  }
  // ---- the second signature (rule 13) for a word w signed as sg in the list L, read in S (identity.md, When a key grant stands): a voice above signs it; or the
  // same key (for a voice of named people, `needed` of them, each having signed it before) signs it again with the closing of the wait in its causal past. A "no"
  // (nos) on one clock's line before her closing cutoff, or in a second signing's causal past, sets it aside: { never }. Else it waits: on `wait` while the wait has
  // not run on her clock, then on `confirm`.
  function twice(w, sg, L, S, nos) {
    if (aboveSigned(w, sg, S)) return { stands: true };
    const wait = sg.p === 0 ? 'PT0S' : (isObj(sg.voice) ? sg.voice.wait : undefined);
    if (wait === undefined) return { stands: false, on: 'confirm' }; // a voice that states no wait brings in nothing by itself
    const zero = isZeroDur(wait), blockers = new Set(nos.map(N => N.hash));
    // 1.9 (00-shared, `wait` and `reach`): at PT0S a word of a key stands when signed; the second signing is her choice, as a wait above zero
    // 1.9-GUESS [3d-14]: this is the restatement's removal of 1.8 rule 13 ("signed twice") that CORE-SET does not list; it changes every key grant and hand-over a first voice or a voice at PT0S signs once (3c-7's hand-over needs it)
    if (zero && sg.kind !== 'names') return { stands: true };
    const onClock = Sx => waitRun(w, wait, L.clocks, Sx, blockers);
    if (!zero && onClock(S) === 'denied') return { never: true, stands: false };
    const mine = c => (sg.kind === 'names' ? sg.voice.names.includes(c.refs.author) : (c.refs.author === id && !!info.get(c.hash) && info.get(c.hash).key === sg.X));
    const again = all.filter(c => c.hash !== w.hash && asList(c.refs.confirms).includes(w.hash) && inS(S, c.hash) && (c.refs.author === id ? counted(c.hash) : countedBy(c)) && mine(c)); // a second signing her key made after an end of it counts for nothing (as the core reads it)
    if (again.some(c => nos.some(N => pastOf(c.hash).has(N.hash)))) return { never: true, stands: false };
    const after = c => zero || onClock(pastOf(c.hash)) === 'run';
    if (sg.kind === 'names' && zero) {
      // 3d-18: at PT0S a voice of other people speaks once `needed` of them have signed it (the word, or a confirm of it), each once
      const v = sg.voice, need = Number.isInteger(v.needed) ? v.needed : (v.names.length === 1 ? 1 : null);
      const ids = new Set(again.map(c => c.refs.author));
      if (v.names.includes(w.refs.author)) ids.add(w.refs.author);
      if (need !== null && ids.size >= need) return { stands: true };
    } else if (sg.kind === 'names') {
      const v = sg.voice, need = Number.isInteger(v.needed) ? v.needed : (v.names.length === 1 ? 1 : null);
      // each of them signs it twice: the key grant itself or an earlier confirm of theirs in this one's causal past, then this one after the wait
      const ids = new Set(again.filter(c => after(c) && (c.refs.author === w.refs.author || again.some(e => e !== c && e.refs.author === c.refs.author && pastOf(c.hash).has(e.hash)))).map(c => c.refs.author));
      if (need !== null && ids.size >= need) return { stands: true };
    } else if (again.some(after)) return { stands: true };
    return { stands: false, on: !zero && onClock(S) !== 'run' ? 'wait' : 'confirm' };
  }
  // a voice restates every voice above its place as it was, and its own place's wait and reach as they were (a new key may go in its own place; a voice of named
  // people stays as it was); only the first voice changes clocks; a voice that leaves its own place out adds nothing below it, bar taking itself out
  const aboveVoice = sg => sg.kind === 'names' && isObj(sg.voice) && sg.voice.above === true && sg.voice.wait !== undefined && !isZeroDur(sg.voice.wait);
  const restates = (k, Lk, sg) => {
    const nv = k.state.voices, ov = Lk.voices, i = sg.p;
    // 1.9 3d-14 (D8, E2): where her list says so (`above: true`), a voice of other people whose `wait` is above zero may sign a key grant that puts a new key in a place above its own (that place's wait and reach kept), or that leaves no voice at all.
    // Only the first voice changes `clocks`, and only the first voice adds or changes a voice of other people. 1.9-GUESS [3d-14]: besides the places above it, its own voice and everything below stay as they were.
    if (aboveVoice(sg) && (nv.length === 0 || !sameVoices(nv.slice(0, i), ov.slice(0, i)))) {
      if (jOf(k.state.clocks) !== jOf(Lk.clocks)) return false;
      if (nv.length === 0) return true;
      if (nv.length !== ov.length || !sameVoices(nv.slice(i), ov.slice(i))) return false;
      for (let j = 0; j < i; j++) {
        const o = ov[j], n = nv[j];
        if (voiceOf(o) === voiceOf(n)) continue;
        if (!isObj(o) || !isObj(n) || Array.isArray(o.names) || Array.isArray(n.names) || !(isStr(n.key) || isStr(n.key_hash))) return false;
        if (jOf(o.wait) !== jOf(n.wait) || jOf(o.reach) !== jOf(n.reach)) return false;
      }
      return true;
    }
    if (nv.length < i || !sameVoices(nv.slice(0, i), ov.slice(0, i))) return false;
    if (i !== 0 && jOf(k.state.clocks) !== jOf(Lk.clocks)) return false;
    if (nv.length === i || sameVoices(nv, ov.filter((_, j) => j !== i))) return true;
    const o = ov[i], n = nv[i];
    if (!isObj(o) || !isObj(n) || jOf(o.wait) !== jOf(n.wait) || jOf(o.reach) !== jOf(n.reach)) return false;
    if (Array.isArray(o.names)) return voiceOf(o) === voiceOf(n);
    return !Array.isArray(n.names);
  };
  // taking oneself out: the list is the old one without the signer's own place, the clock unchanged, no key added
  const selfOut = (k, Lk, sg) => sg.p >= 0 && sameVoices(k.state.voices, Lk.voices.filter((_, i) => i !== sg.p)) && jOf(k.state.clocks) === jOf(Lk.clocks) && k.state.public_key_sign === undefined && k.state.shown_key === undefined;
  // a key grant that only narrows (blocks.md, Finality, Signed twice): it adds and shows no key, and its list is the old one with voices left out, each kept one as
  // it was, the clock unchanged
  const narrows = (k, Lk) => {
    if (k.state.public_key_sign !== undefined || k.state.shown_key !== undefined) return false;
    if (!Array.isArray(k.state.voices)) return true;
    if (jOf(k.state.clocks) !== jOf(Lk.clocks)) return false;
    let j = 0;
    return k.state.voices.every(v => { while (j < Lk.voices.length && voiceOf(Lk.voices[j]) !== voiceOf(v)) j++; return j++ < Lk.voices.length; });
  };
  // a "no" (identity.md, Saying no is signing): another key grant stating a list for the same list, counted, by a voice above the grant's signer
  const nosOf = (k, Lk, sg) => (Array.isArray(k.state.voices) ? lists.filter(N => N !== k && N.refs.updates === Lk.hash && countedBy(N) && (() => { const pl = placeIn(N, Lk); return !!pl && !pl.under && pl.p < sg.p; })()) : []);
  // two key grants of one voice, neither in the other's causal past (identity.md, Two by one voice)
  const paired = (k, sg, Lk, S) => kgs.some(k2 => {
    if (k2 === k || !inS(S, k2.hash) || pool.sees(k.hash, k2.hash) || pool.sees(k2.hash, k.hash) || !countedBy(k2)) return false;
    if (k.refs.author === id) return k2.refs.author === id && !!info.get(k2.hash) && info.get(k2.hash).key === sg.X;
    if (k2.refs.author === id || k2.refs.updates !== k.refs.updates || placeOfOther(k2, Lk) !== sg.p) return false;
    // 1.9 3d-14: a key grant of a voice of other people is one of a pair only once `needed` of them have signed it or named it in `refs.confirms`
    if (sg.kind === 'names') { const v = sg.voice, need = Number.isInteger(v.needed) ? v.needed : (v.names.length === 1 ? 1 : null); const signers = x => new Set([x.refs.author, ...all.filter(c => asList(c.refs.confirms).includes(x.hash) && v.names.includes(c.refs.author) && countedBy(c)).map(c => c.refs.author)]); return need !== null && signers(k).size >= need && signers(k2).size >= need; }
    return true;
  });
  // does a key grant stand, read in S (identity.md, When a key grant stands): { stands, on } while it waits, { never } when it can never stand, { free } when it
  // stands when signed and waits on nothing (an encryption key; taking oneself out)
  function kgStands(k, S) {
    const mk = sKey(S);
    if (!memo.kg.has(mk)) memo.kg.set(mk, new Map());
    const m = memo.kg.get(mk);
    if (m.has(k.hash)) return m.get(k.hash);
    m.set(k.hash, { stands: false, on: 'confirm' });
    const r = kgStandsNow(k, S);
    m.set(k.hash, r);
    return r;
  }
  function kgStandsNow(k, S) {
    const never = { stands: false, never: true };
    const Kp = pastOf(k.hash), Lk = standing(Kp), isList = Array.isArray(k.state.voices);
    if (Lk.voices.length === 0) return never;
    // one list at a time: a list names the list standing in its own causal past (one already replaced is no key grant)
    if (isList && k.refs.updates !== Lk.hash) return never;
    const sg = kgSigner(k);
    if (!sg) return never;
    if (isList && !restates(k, Lk, sg)) return never;
    // 1.9 3d-12 (rule 10): a key in doubt never decides its own replacement: a key's own key grant is never a suite move; only a voice above a key moves it to a key of another suite
    if (isList && sg.kind === 'key') { const ov = Lk.voices[sg.p], nv = k.state.voices[sg.p]; if (isObj(ov) && isObj(nv) && isStr(ov.key) && isStr(nv.key) && (suiteOfKey(nv.key) || 'std') !== (suiteOfKey(ov.key) || 'std')) return never; }
    if (sg.kind === 'names') {
      const v = sg.voice, need = Number.isInteger(v.needed) ? v.needed : (v.names.length === 1 ? 1 : null);
      const ids = new Set([k.refs.author, ...all.filter(c => asList(c.refs.confirms).includes(k.hash) && inS(S, c.hash) && v.names.includes(c.refs.author) && countedBy(c)).map(c => c.refs.author)]);
      if (need === null || ids.size < need) return { stands: false, on: 'confirm' };
    }
    if (isList && selfOut(k, Lk, sg)) return { stands: true, free: true }; // taking oneself out: it stands when signed
    if (paired(k, sg, Lk, S)) return never;
    // 1.9 3d-11: no kind of key grant skips the cut, the reach, or the pair rule. A key grant that states only `public_key_encrypt` is a grant of hers: it waits on its key's reach and passes the cut as any grant of that key does, and is not signed twice
    if (!isList && !isStr(k.state.public_key_sign) && !isStr(k.state.shown_key) && isStr(k.state.public_key_encrypt)) return { stands: true };
    if (!aboveVoice(sg) && narrows(k, Lk)) return { stands: true }; // a word that only narrows is not signed twice (1.9 3d-14: a reach above is never narrowing)
    return twice(k, sg, Lk, S, nosOf(k, Lk, sg));
  }
  // rule 13 for a word of hers that is no key grant, read in S
  function twiceOf(w, S) {
    const s = info.get(w.hash);
    if (!s) return never0;
    const Wp = pastOf(w.hash), L = standing(Wp), pl = placeOfKey(s.key, L, Wp);
    if (!pl) return never0;
    return twice(w, { p: pl.p, under: !!pl.under, kind: 'key', X: s.key, voice: L.voices[pl.p] }, L, S === undefined ? null : S, []);
  }
  const never0 = { stands: false, never: true };
  // a reach (identity.md, Reach): her clock holds the word through its receipt plus the reach, with no key grant that leaves the key out received before those
  // cutoffs on any one line, or a voice above that key confirmed it. { ok }, { ok: false } while it waits, { never } once set aside
  function reachOf(w, S) {
    const s = info.get(w.hash);
    if (!s) return { ok: true };
    const Wp = pastOf(w.hash), L = standing(Wp), pl = placeOfKey(s.key, L, Wp);
    if (!pl) return { ok: true };
    const v = L.voices[pl.p];
    if (!isObj(v) || v.reach === undefined) return { ok: true }; // a voice that states no reach is not read on her clock
    const Sx = S === undefined ? null : S;
    if (aboveSigned(w, { p: pl.p, under: !!pl.under, kind: 'key' }, Sx)) return { ok: true };
    const ends = new Set(lists.filter(E => E !== w && leavesOut(E, s.key)).map(E => E.hash));
    const r = waitRun(w, v.reach, L.clocks, Sx, ends);
    return r === 'run' ? { ok: true } : r === 'denied' ? { ok: false, never: true } : { ok: false };
  }
  // 1.9 stage 4 (A voice's bounds): a `key` voice that states `each`, `limit` (and `every`) holds one line with the same bounds as a grant's; a key grant that adds a key under it may pass
  // that key a part (its own `limit`, and an `each` no higher), a draw on the voice's line. A word of that key that moves an amount of hers (a transfer, at its `state.amount`; a key grant that
  // passes a part, at that part) is counted on its key's line; with `every`, the period turns at the cutoffs of her list's clocks whose refs.subject is the block that brought the key in and whose
  // span is no shorter than `every`. A word that does not fit stands only when a voice above that key has said it (`confirm`), and holds nothing on the line.
  const boundAmount = x => (x.type === 'transfer' && x.state.status === undefined ? (isAmount(x.state.amount) ? x.state.amount : null)
    : isKeyGrant(x) && !Array.isArray(x.state.voices) && x.refs.subject === id && isAmount(x.state.limit) ? x.state.limit : null);
  function boundsOf(w, depth = 0) {
    const s = info.get(w.hash), a = boundAmount(w);
    if (!s || !a) return { ok: true };
    const Wp = pastOf(w.hash), Ls = standing(Wp), pl = placeOfKey(s.key, Ls, Wp);
    if (!pl) return { ok: true };
    const bounds = pl.under ? (() => { const u = pool.get(w.refs.key); return u ? u.state : null; })() : Ls.voices[pl.p];
    if (!isObj(bounds) || (bounds.each === undefined && bounds.limit === undefined)) return { ok: true };
    if (isAmount(bounds.each) && (!sameKind(a, bounds.each) || fcmp(dec(a.value), dec(bounds.each.value)) > 0)) return { ok: false };
    if (!isAmount(bounds.limit)) return { ok: true };
    if (!sameKind(a, bounds.limit) || depth > 64) return { ok: false };
    const brought = isStr(w.refs.key) ? w.refs.key : id, ks = clocksOf(Ls.clocks);
    const periodOf = x => {
      if (!isStr(bounds.every) || !ks) return 0;
      const P = pastOf(x.hash);
      return all.filter(c => c.type === 'observe' && c.state.kind === 'cutoff' && asList(c.refs.subject).includes(brought) && isStr(c.state.when) && parseDur(c.state.when) && s4Durs(c.state.when, bounds.every) >= 0 && P.has(c.hash)
        && ks.names.some(n => clockLine(n, pool).includes(c))).length;
    };
    const mine = periodOf(w);
    let sum = F0;
    for (const x of authored) {
      if (x.hash === w.hash || !Wp.has(x.hash) || x.refs.key !== w.refs.key) continue;
      const sx = info.get(x.hash), bx = boundAmount(x);
      if (!sx || sx.key !== s.key || !bx || !sameKind(bx, bounds.limit) || periodOf(x) !== mine || !boundsOf(x, depth + 1).ok) continue; // a word that waits holds nothing on the line
      sum = fadd(sum, dec(bx.value));
    }
    return { ok: fcmp(fadd(sum, dec(a.value)), dec(bounds.limit.value)) <= 0 };
  }
  function boundsWait(w) {
    if (boundsOf(w).ok) return false;
    const s = info.get(w.hash), Wp = pastOf(w.hash), Ls = standing(Wp), pl = s && placeOfKey(s.key, Ls, Wp);
    return !(pl && aboveSigned(w, { p: pl.p, under: !!pl.under, kind: 'key' }, null));
  }
  // a key grant that leaves a key of hers out of the list it replaces
  const leavesOut = (E, X) => { const old = listOfBlock(pool.get(E.refs.updates), id); return !!old && hasKey(old, X) && !hasKey(listOfBlock(E, id), X); };
  // ---- the cut (blocks.md, The cut) for a block of hers: the ends of its key that stand among the blocks held; for a key under a voice, the stops of the key grant
  // that added it and the ends of its voice's key that did not see that grant
  function keyEnds(b) {
    const s = info.get(b.hash);
    if (!s) return [];
    const S = pastOf(b.hash), pl = placeOfKey(s.key, standing(S), S);
    let X = s.key, U = null;
    if (pl && pl.under) { U = pool.get(b.refs.key); const sg = U && kgSigner(U); if (sg) X = sg.X; }
    const out = lists.filter(E => leavesOut(E, X) && (!U || !pastOf(E.hash).has(U.hash)) && kgStands(E, null).stands);
    if (U) for (const st of all) if (st.type === 'grant' && st.state.status === 'stopped' && st.refs.updates === U.hash && st.refs.author === id && cb(st.hash)) out.push(st);
    return out;
  }
  // a block has seen an end (blocks.md, The cut, Seen): the end is in its causal past, or, where its key names a clock, the lines that show the end before the block are `names` less `needed`, plus one. A block that signs the end again has not seen it: the end stands only by it.
  // blocks.md, Seen: a clock's line shows the end seen where it holds her receipt of the end before her receipt of the block; a line that holds no
  // receipt of the block shows nothing seen (end pass 2026-11-20, as the core reads it); 1.9 3d-6: `names` less `needed`, plus one, lines must show it
  const seenOnLine = (clock, b, E) => clock.names.filter(n => { const line = lineBlocks(n, null), rb = receiptsOf(line, b.hash), re = receiptsOf(line, E.hash); return rb.length > 0 && rb.every(r => re.some(e => e === r || placedEarlier(e, r))) && rb.some(r => re.some(e => placedEarlier(e, r))); }).length >= clock.names.length - clock.needed + 1;
  const seenEnd = (b, E, clock) => !asList(b.refs.confirms).includes(E.hash) && (pastOf(b.hash).has(E.hash) || (!!clock && seenOnLine(clock, b, E)));
  // named: a block names a word in any ref but prev and after, or in state.counted_to
  const namesIt = (x, h) => Object.entries(x.refs).some(([k, v]) => k !== 'prev' && k !== 'after' && asList(v).includes(h)) || x.state.counted_to === h;
  // the blocks of other persons a block is joined to (1.9 3d-9): those that name it, and those it names (as her yes), by any ref but `prev`, `after`, `key` and `author`
  const joinRefs = x => Object.entries(x.refs).filter(([k]) => !['author', 'prev', 'key', 'after'].includes(k)).flatMap(([, v]) => asList(v)).filter(isStr);
  function joinersOf(b) {
    const named = new Set(joinRefs(b));
    const inside = gatheredBy(b);
    return all.filter(o => o.hash !== b.hash && isStr(o.refs.author) && o.refs.author !== b.refs.author && !inside(o) && (named.has(o.hash) || joinRefs(o).includes(b.hash)) && !(o.type === 'observe' && (o.state.kind === 'receipt' || o.state.kind === 'cutoff')) && countedBy(o)); // 1.9-GUESS [3d-9]: a clock's receipt or cutoff is the clock's reading, no block joined to the word
  }
  // 1.9 stage 6 (D13, C15's last sentences): for a block `as` a circle, a move's signer is all its hands together: no signer of one of its hands, no tool of hers (the holder of a
  // grant she signed in her own name) and no one under a grant she gave is "another person" joined to it. Read from the blocks alone (who confirms it), so the identity fold
  // never asks the circle's rows: a confirm of the move by anyone is one of its hands.
  function gatheredBy(b) {
    if (!isStr(b.refs.as) || !isFoundingCircle(pool.get(b.refs.as))) return () => false;
    const signers = new Set([b.refs.author, ...all.filter(o => asList(o.refs.confirms).includes(b.hash) && isStr(o.refs.author)).map(o => o.refs.author)]);
    const given = all.filter(g => g.type === 'grant' && g.state.status === undefined && signers.has(g.refs.author) && g.refs.as === undefined);
    const tools = new Set(given.flatMap(g => asList(g.refs.to))), grants = new Set(given.map(g => g.hash));
    return o => signers.has(o.refs.author) || tools.has(o.refs.author) || (isStr(o.refs.under) && grants.has(o.refs.under));
  }
  // 1.9 3d-8, 3d-9: a block passes an end E of its key (or, with E null, the ends that may yet come) when
  //  - the end has it in its past (inside the cut); or
  //  - another person's block is joined to it and has not seen the end (where the key names a clock: the clocks' receipts of the block, held in that block's past, state that no end is before it, `needed` of them); or
  //  - it is joined to no other person's block (it names none, and none names it as her yes): it stands against those ends when signed, bar a key grant by a voice above its key whose `counted_to` is before it, which puts it off her line
  //    toward every block that does not have it in its past (question 5). 1.9-GUESS [3d-8]: "toward every block that does not have it in its past" is read at a block that is joined to it: a joiner that has it in its past keeps it.
  function passesEnd(b, E, clock) {
    if (E && (E.hash === b.hash || pastOf(E.hash).has(b.hash))) return true;
    const joiners = joinersOf(b);
    if (!joiners.length) {
      if (E && cutByCountedTo(b, E)) return false;
      return true;
    }
    return joiners.some(o => (clock ? clockSays(clock, b, E, pastOf(o.hash)).passed : E ? !pastOf(o.hash).has(E.hash) : true));
  }
  // 'never' when it has seen an end, 'passed' when it has passed each, else 'waiting'
  function cutOf(b) {
    // an end whose `counted_to` is this block or has it in its past says this block counts (question 5): it is not an end for it
    const ends = keyEnds(b).filter(E => !(isStr(E.state.counted_to) && (E.state.counted_to === b.hash || pastOf(E.state.counted_to).has(b.hash)))), clock = clocksOf(reachClock(b));
    if (ends.some(E => seenEnd(b, E, clock))) return 'never';
    return (ends.length ? ends.every(E => passesEnd(b, E, clock)) : passesEnd(b, null, clock)) ? 'passed' : 'waiting';
  }
  // the clock a word of hers reads its ends on: the list's clocks, when the voice of its key states a reach (the key names a clock exactly then: identity.md, Ending a key)
  function reachClock(w) {
    const s = info.get(w.hash);
    if (!s) return null;
    const Wp = pastOf(w.hash), L = standing(Wp), pl = placeOfKey(s.key, L, Wp), v = pl && L.voices[pl.p];
    return isObj(v) && v.reach !== undefined ? L.clocks : null;
  }
  // ---- what the fold gives
  const authoredProxy = new Proxy({}, {
    get: (_, h) => (typeof h !== 'string' ? undefined : h === id ? true : authoredSet.has(h) ? counted(h) : undefined),
    has: (_, h) => typeof h === 'string' && (h === id || authoredSet.has(h)),
    ownKeys: () => [id, ...authored.map(b => b.hash)],
    getOwnPropertyDescriptor: (_, h) => (typeof h === 'string' && (h === id || authoredSet.has(h)) ? { enumerable: true, configurable: true, writable: true, value: h === id ? true : counted(h) } : undefined),
  });
  const keyMap = new Map([[genKey, { via: null }]]);
  for (const k of kgs) for (const c of keysBroughtBy(k, id)) if (!keyMap.has(c.key)) keyMap.set(c.key, { via: k });
  const shownKeys = L => kgs.filter(k => isStr(k.state.shown_key) && matchHash(L, k.state.shown_key) && info.get(k.hash) && info.get(k.hash).key === k.state.shown_key).map(k => k.state.shown_key);
  // 3d-16: a block of hers one of her clocks received before the cutoffs that closed her close's wait: a line of the clock her list stated
  // at the close holds a receipt of it placed before a cutoff of that close (end pass 2026-11-20)
  const receivedBeforeCloseWait = (h, close) => {
    // her clock: the one the list her close replaces states (`refs.updates` of the close)
    const C = pool.get(close), U = C && isStr(C.refs.updates) ? pool.get(C.refs.updates) : null;
    const ks = U && isObj(U.state) ? clocksOf(U.state.clocks) : null;
    if (!ks) return false;
    return ks.names.some(n => {
      const line = lineBlocks(n, null);
      const cuts = line.filter(x => x.type === 'observe' && x.state.kind === 'cutoff' && asList(x.refs.subject).includes(close));
      return receiptsOf(line, h).some(r => cuts.some(c => placedEarlier(r, c)));
    });
  };
  const out = {
    signed_by_author: authoredProxy, info, keyMap, genKey, idSuite, receivedBeforeCloseWait,
    get keys() {
      const L = standing(null), ks = new Set();
      for (const v of L.voices) if (isObj(v) && isStr(v.key)) ks.add(v.key);
      for (const X of shownKeys(L)) ks.add(X);
      if (isStr(genKey) && matchHash(L, genKey)) ks.add(genKey); // 1.9 3d-12 (decided in building): her genesis shows its own key, so a hidden voice that names it is a key she has shown
      for (const U of unders) if (!ks.has(U.state.public_key_sign) && underPlace(U, null) !== null) ks.add(U.state.public_key_sign);
      return L.voices.length ? [...ks].sort() : [];
    },
    get voices() { return standing(null).voices; },
    get clocks() { return standing(null).clocks; },
    get closed() { return standing(null).voices.length === 0; },
    // 1.9 3d-15: the standing key grants that leave no voice at all (a close, for good)
    get closes() { return chain(null).filter(c => c.via && c.list.voices.length === 0).map(c => c.via.hash); },
    get waiting() {
      // every block of hers, and every key grant for her list, that does not stand yet and may: one entry for each thing it waits on
      const w = [];
      for (const b of [...authored, ...kgs.filter(k => !authoredSet.has(k.hash))]) for (const x of standsOf(b, pool).waiting) w.push(x);
      return w.sort((a, b) => cmp(a.block, b.block) || cmp(a.on, b.on));
    },
    get timeline() {
      const ch = chain(null), tl = [], seen = new Set();
      const add = (key, by, voice, under, suite) => { if (seen.has(key)) return; seen.add(key); const E = endsOfKey(key, null)[0]; tl.push({ key, by, voice, under, suite: suite || suiteOfKey(key) || 'std', ended: E ? E.hash : null }); };
      add(genKey, id, 0, null, idSuite);
      for (let i = 1; i < ch.length; i++) {
        ch[i].list.voices.forEach((v, p) => { if (isObj(v) && isStr(v.key)) add(v.key, ch[i].via.hash, p, null, v.suite); });
        for (const k of kgs) if (isStr(k.state.shown_key) && matchHash(ch[i].list, k.state.shown_key) && info.get(k.hash) && info.get(k.hash).key === k.state.shown_key) add(k.state.shown_key, k.hash, ch[i].list.voices.findIndex(v => keyAt(v, k.state.shown_key)), null, (matchHash(ch[i].list, k.state.shown_key) || {}).suite);
      }
      for (const U of unders) {
        if (!kgStands(U, null).stands) continue;
        const sg = kgSigner(U);
        if (!sg || sg.kind !== 'key' || seen.has(U.state.public_key_sign)) continue;
        seen.add(U.state.public_key_sign);
        tl.push({ key: U.state.public_key_sign, by: U.hash, voice: null, under: sg.X, suite: U.state.suite || suiteOfKey(U.state.public_key_sign) || 'std', ended: underPlace(U, null) === null ? (all.find(st => st.refs.updates === U.hash && st.state.status === 'stopped') || { hash: (endsOfKey(sg.X, null)[0] || {}).hash || null }).hash || null : null });
      }
      const place = e => (e.voice === null || e.voice === undefined ? Number.MAX_SAFE_INTEGER : e.voice); // of one block, by place; a key under a voice last
      return tl.sort((a, b) => pool.past(a.by).size - pool.past(b.by).size || cmp(a.by, b.by) || place(a) - place(b));
    },
    kgStands: (k, S) => kgStands(k, S === undefined ? null : S), twiceOf, reachOf, boundsOf, boundsWait, reachClock, cutOf, endsOfKey, standingAt: S => standing(S), kgSigner, lineBlocks, receiptOn,
  };
  self.fold = out;
  return out;
}
// clocks { names, needed } (blocks.md, A named clock), checked as written: each name a block id, needed by Counts (a set of one needs none); null when written wrong
function clocksOf(k) {
  if (!isObj(k) || Object.keys(k).some(x => !P.shapes.clocks.includes(x))) return null;
  if (!Array.isArray(k.names) || !k.names.length || !k.names.every(n => isStr(n) && RX.id.test(n)) || k.names.some((n, i) => i && !(k.names[i - 1] < n))) return null;
  if (k.needed === undefined) return k.names.length === 1 ? { names: k.names, needed: 1 } : null;
  return Number.isInteger(k.needed) && k.needed >= 1 && k.needed <= k.names.length ? { names: k.names, needed: k.needed } : null;
}
// ---- Finality (blocks.md): does a word stand. Read on the blocks held, with no clock and no arrival.
// The blocks a block names for its meaning (protocol.json needs: refs.under, answers, updates, for, parent, schema, state.counted_to, a grant's scope.on)
const namedFor = b => {
  const out = [];
  for (const k of ['under', 'answers', 'updates', 'for', 'parent', 'schema']) for (const x of asList(b.refs[k])) if (isStr(x)) out.push(x);
  if (isStr(b.state.counted_to)) out.push(b.state.counted_to);
  if (b.type === 'grant' && isObj(b.state.scope)) for (const x of asList(b.state.scope.on)) if (isStr(x)) out.push(x);
  return [...new Set(out)];
};
// whether a block is a word that lets another act or spend for her (blocks.md, Finality, Signed twice): a grant (not a key grant, a stop, an answer or a machine
// lock), an account word, a hand-over of a claim (a transfer that names in refs.what a deal, or a claim of invasion)
function givesPower(b, pool) {
  if (b.type === 'observe' && b.state.status === 'resumed' && b.refs.updates !== undefined) return true; // 1.9 stage 4 (S1): a lift gives her tools their power back, so it waits her voice's `wait`
  if (b.state.status !== undefined || b.refs.answers !== undefined) return false;
  if (b.type === 'grant') return b.state.kind !== 'key' && b.state.kind !== 'stop';
  if (b.type === 'observe') return b.state.kind === 'account';
  if (b.type === 'transfer') return asList(b.refs.what).some(h => { const c = pool.get(h); return !!c && c.type !== 'thing'; }); // R-J5: a hand-over of a claim is a transfer that names in `refs.what` any block that is not a `thing`; it moves something of hers, so it waits on its key's `reach`
  return false;
}
// what `stands` lists, in this order (protocol.json door.ops.stands)
const ON = ['wait', 'reach', 'confirm', 'end', 'named', 'hands', 'condition'];
// Finality (blocks.md): does a word stand, read on the blocks held. { stands, waiting: [{ block, on }] }: each thing it waits on, once; empty when it can never stand.
function standsOf(b, poolIn) {
  const pool = poolOf(poolIn);
  pool._stands = pool._stands || new Map();
  const mine = pool.get(b.hash) === b;
  if (mine && pool._stands.has(b.hash)) { const v = pool._stands.get(b.hash); if (v.busy) { if (pool._inCircle) pool._taint = (pool._taint || 0) + 1; return { stands: v.stands, waiting: v.waiting }; } return v; }
  if (mine) pool._stands.set(b.hash, { stands: false, waiting: [{ block: b.hash, on: 'end' }], busy: true }); // asked again from inside itself: not yet (1.9 stage 6: and nothing that read this answer is kept)
  const t0 = pool._taint || 0;
  const r = standsNow(b, pool);
  if (mine) { if ((pool._taint || 0) === t0) pool._stands.set(b.hash, r); else pool._stands.delete(b.hash); }
  return r;
}
function standsNow(b, pool, skipHands) {
  const never = { stands: false, waiting: [] };
  if (b.type === 'actor' && b.refs.author === undefined) return { stands: soundGenesis(b), waiting: [] };
  const author = b.refs.author;
  if (!isStr(author)) return never;
  const idf = identityFold(author, pool);
  if (idf.signed_by_author[b.hash] !== true && !(pool._assumed && pool._assumed.has(b.hash))) return never;
  const on = new Set();
  // every block it names for its meaning stands
  // 1.9 3d-7: no reading of a clock reaches outside the causal past of the block that relies on it: a block it names for its meaning stands as read in that past
  { const names = namedFor(b); if (names.length) { const past = pool.past(b.hash); const sub = names.some(h => { const n = pool.get(h); return n && n.type === 'grant' && isKeyGrant(n); }) ? new Pool(pool.all().filter(x => past.has(x.hash) || x.hash === b.hash)) : pool;
      for (const h of names) { const kgN = (() => { const x = pool.get(h); return !!x && x.type === 'grant' && isKeyGrant(x); })(); const P2 = kgN ? sub : pool; const n = P2.get(h); if (!n || !standsOf(n, P2).stands) on.add('named'); } } }
  const kg = isKeyGrant(b) && b.state.epoch === undefined; // a rekey (profiles/rekeys.md) is her circle's encryption key, not a voice of any list: it stands as any word of its signer does
  let free = false;
  if (kg) {
    if (!isStr(b.refs.subject)) return never;
    const r = identityFold(b.refs.subject, pool).kgStands(b);
    if (r.never) return never;
    if (!r.stands) on.add(r.on);
    free = !!r.free;
  }
  if (!free) {
    // the cut: every end of its key, it must pass
    const c = idf.cutOf(b);
    if (c === 'never') return never;
    if (c === 'waiting') on.add('end');
    // a reach reaches her promises, transfers and grants (her key grants of her own list too); a key grant she signs in another's list waits on nothing of hers
    if (['promise', 'transfer', 'grant'].includes(b.type) && !(kg && b.refs.subject !== author)) { const rr = idf.reachOf(b); if (rr.never) return never; if (!rr.ok) on.add('reach'); }
    if (idf.boundsWait(b)) on.add('confirm'); // 1.9 stage 4: a word past its key's line's bounds waits for a voice above that key
    if (!kg && givesPower(b, pool)) { const r = idf.twiceOf(b); if (r.never) return never; if (!r.stands) on.add(r.on); }
  }
  // 1.9 stage 6 (circles.md, C0, C18): a block `as` a circle stands only where a row holds for it, or every owner signs it together; until then it waits on `hands`
  if (!skipHands && b.refs.as !== undefined && !circleHolds(b, pool).holds) on.add('hands');
  // its own condition (stage 5 says where it is read): until then it waits on it
  if (b.state.condition !== undefined) on.add('condition');
  return { stands: on.size === 0, waiting: ON.filter(o => on.has(o)).map(o => ({ block: b.hash, on: o })) };
}
// ================================================================ valid(block, held) and read(block, held)  (core.md, section 8)
// valid: who said these bytes. block: a whole { hash?, type, state, refs, signature } or a held header { header, header_signature }; held: the blocks held (an array, a Map or a
// Pool; whole blocks and sealed messages). Returns refusals [{ code, detail }] of the first check that finds anything, one per code, in protocol.json's order; `unmet` and
// `unknown_suite` are waits, not refusals. It reads only the block's pieces: no prev, no other link, no schema, no clock.
function uniqueCodes(list) { const seen = new Set(), out = []; for (const f of list) if (!seen.has(f.code)) { seen.add(f.code); out.push({ code: f.code, detail: f.detail || '' }); } return out; }
const heldList = h => (!h ? [] : h instanceof Pool ? h.all() : h instanceof Map ? [...h.values()] : Array.isArray(h) ? h : h.held ? heldList(h.held) : []);
function validStages(block, heldIn) {
  if (!isObj(block)) return { stage: 1, findings: [{ stage: 1, code: 'not_canonical', detail: 'not a block' }], needs: [] };
  const isMsg = block.type === undefined && isObj(block.header) && block.state === undefined;
  // a value with a state or refs and no type is a block that lacks its type (core.md, section 8, bytes: a block is exactly { type, state, refs }),
  // never a held header (end pass 2026-11-20: the core said so, and the text reads the bytes before the header)
  if (!isMsg && block.type === undefined && (block.state !== undefined || block.refs !== undefined)) return { stage: 2, findings: [{ stage: 2, code: 'not_canonical', detail: 'a block is exactly { type, state, refs }: this one has no type' }], needs: [] };
  const own = isMsg ? headerEntry(block) : block;
  const entries = normEntries(heldList(heldIn));
  const ctx = { idx: buildIdx(entries), memo: new Map(), stack: new Set() };
  return judge(own, ctx, true);
}
function valid(block, held) { return inCodeOrder(validStages(block, held).findings); }
// read: whether this reader can read a block that is valid; every code it finds (names_missing, names_unread, then check 7). `schemas` is the store check 7 reads; with none
// (null) it is the schema store of the blocks held (schemas_from; core.md, section 8).
// 1.9 stage 7 (B5): `read` takes `runs?`, the ids of the rule sets this reader runs (null or left out: none, the core alone). A block that states a rule set in `runs` is read by the core's rules (a later rule counts only
// in a block that names it: the core has none yet); one that states another set is `unknown_rules`.
let RUNS = [];
function readFindings(block, heldIn, schemasIn, runsIn) {
  if (!isObj(block) || block.type === undefined || !isObj(block.state) || !isObj(block.refs)) throw argError('read is asked of a whole block');
  if (runsIn !== undefined && runsIn !== null && !(Array.isArray(runsIn) && runsIn.every(x => isStr(x) && RX.hash.test(x)))) throw argError('runs is a list of rule-set ids, or null');
  const prevRuns = RUNS; RUNS = Array.isArray(runsIn) ? runsIn : [];
  try { return readFindingsNow(block, heldIn, schemasIn); } finally { RUNS = prevRuns; }
}
function readFindingsNow(block, heldIn, schemasIn) {
  const held = normEntries(heldList(heldIn)), own = { ...block };
  if (own.hash === undefined) own.hash = idOf(own, held);
  const r = classify([...held.filter(e => e.hash !== own.hash), own], { schemas: Array.isArray(schemasIn) ? normHeld(schemasIn) : undefined });
  if (!r.validE.has(own.hash)) throw argError('read is asked of a block that is not valid');
  return r.codes.get(own.hash) || [];
}

// ================================================================ the compact form (encoding.md, CBOR)
// A public block as CBOR (RFC 8949). The id is always the hash of the canonical JSON. Writing is deterministic; a reader refuses
// indefinite lengths, floats, tags, null, undefined, duplicate keys and integers outside +-(2^53 - 1).
const CB = C.cbor, MAXBI = BigInt(P.integers.max);
const cbHead = (major, n) => {
  const m = major << 5;
  if (n < 24n) return Buffer.from([m | Number(n)]);
  if (n < 256n) return Buffer.from([m | 24, Number(n)]);
  if (n < 65536n) { const b = Buffer.alloc(3); b[0] = m | 25; b.writeUInt16BE(Number(n), 1); return b; }
  if (n < 4294967296n) { const b = Buffer.alloc(5); b[0] = m | 26; b.writeUInt32BE(Number(n), 1); return b; }
  const b = Buffer.alloc(9); b[0] = m | 27; b.writeBigUInt64BE(n, 1); return b;
};
const cbEnc = v => { // v: {int} | {bytes} | {text} | {array} | {map: [[k, v]]} | {bool} | {raw}
  if ('int' in v) return v.int >= 0n ? cbHead(0, v.int) : cbHead(1, -1n - v.int);
  if ('bytes' in v) return Buffer.concat([cbHead(2, BigInt(v.bytes.length)), v.bytes]);
  if ('text' in v) { const b = Buffer.from(v.text, 'utf8'); return Buffer.concat([cbHead(3, BigInt(b.length)), b]); }
  if ('array' in v) return Buffer.concat([cbHead(4, BigInt(v.array.length)), ...v.array.map(cbEnc)]);
  if ('bool' in v) return Buffer.from([v.bool ? 0xf5 : 0xf4]);
  if ('raw' in v) return v.raw;
  const pairs = v.map.map(([k, x]) => [cbEnc(k), cbEnc(x)]);
  pairs.sort((a, b) => a[0].length - b[0].length || Buffer.compare(a[0], b[0])); // RFC 8949 4.2.1: length first, then bytewise
  for (let i = 1; i < pairs.length; i++) if (pairs[i][0].equals(pairs[i - 1][0])) throw new Error('cbor: duplicate key');
  return Buffer.concat([cbHead(5, BigInt(pairs.length)), ...pairs.flatMap(([k, x]) => [k, x])]);
};
const cbTokens = pat => pat.split('.').flatMap(t => t.endsWith('[]') ? [t.slice(0, -2), '[]'] : [t]);
function cbMatch(pat, path) {
  const p = cbTokens(pat), q = p.includes('[]') ? path : path.filter(t => t !== '[]'); // under refs.* an array's elements count too
  return p.length === q.length && p.every((t, i) => t === '*' || t === q[i]);
}
function cbKind(path) {
  for (const [kind, list] of [['hash', CB.bytes.hash], ['sign', CB.bytes.sign_key], ['enc', CB.bytes.encrypt_key], ['nonce', CB.bytes.nonce]]) if (list.some(pat => cbMatch(pat, path))) return kind;
  return null;
}
const STD_PREFIX = Buffer.from(SPKI_PREFIX.std, 'hex');
const timePlace = path => { const j = path.join('.'); return j === 'state' || j === 'state.terms' || j === 'state.scope' || j === 'state.terms.lines.[]'; };
const TYPE_INDEX = Object.keys(P.types);
// a map key: its index in the key table when the short form is asked and the table has it, else its text
const cbKey = (k, short) => (short && CB.keys.includes(k) ? { int: BigInt(CB.keys.indexOf(k)) } : { text: k });
function cbOut(v, path, short) {
  if (typeof v === 'boolean') return { bool: v };
  if (typeof v === 'number') {
    if (!Number.isInteger(v) || Math.abs(v) > P.integers.max) throw new Error('cbor: ' + path.join('.') + ' is not an integer in range');
    return { int: BigInt(v) };
  }
  if (typeof v === 'string') {
    const kind = cbKind(path);
    if (kind === 'hash' && RX.hash.test(v)) return { bytes: Buffer.from(v, 'hex') };
    if (kind === 'sign' && suiteOfKey(v)) return { bytes: suiteOfKey(v) === 'std' ? Buffer.from(v, 'hex').subarray(STD_PREFIX.length) : Buffer.from(v, 'hex') };
    if (kind === 'enc' && (/^[0-9a-f]{64}$/.test(v) || /^04[0-9a-f]{128}$/.test(v))) return { bytes: Buffer.from(v, 'hex') };
    if (kind === 'nonce' && RX.nonce.test(v)) return { bytes: Buffer.from(v, 'hex') };
    return { text: v };
  }
  if (Array.isArray(v)) return { array: v.map(x => cbOut(x, [...path, '[]'], short)) };
  const key = k => cbKey(k, short);
  const here = timePlace(path);
  return { map: Object.entries(v).map(([k, x]) => {
    const p = [...path, k];
    let val;
    if (path.length === 0 && k === 'type' && short && TYPE_INDEX.includes(x)) val = { int: BigInt(TYPE_INDEX.indexOf(x)) };
    else if (here && TIME_FIELDS.includes(k) && typeof x === 'string' && RX.time.test(x)) val = { int: BigInt(Date.parse(x)) };
    else if (here && k === 'when' && isObj(x)) val = { map: Object.entries(x).map(([wk, wv]) => [key(wk), (wk === 'from' || wk === 'to') && typeof wv === 'string' && RX.time.test(wv) ? { int: BigInt(Date.parse(wv)) } : cbOut(wv, [...p, wk], short)]) };
    else val = cbOut(x, p, short);
    return [key(k), val];
  }) };
}
// cbor_encode(block, short): the message [t, block, signature]; nothing names a suite (core.md, section 2)
function cborEncode(block, short) {
  const body = cbOut({ type: block.type, state: block.state, refs: block.refs }, [], !!short);
  const items = [{ int: BigInt(short ? CB.table : 0) }, body, { bytes: Buffer.from(block.signature, 'hex') }];
  return cbEnc({ array: items });
}
function cbRead(buf) {
  let at = 0;
  const need = n => { if (at + n > buf.length) throw new Error('cbor: ends too soon'); };
  const item = depth => {
    if (depth > READ_DEPTH) throw new Error('cbor: too deep');
    need(1); const first = buf[at++], major = first >> 5, ai = first & 31;
    const arg = () => {
      if (ai < 24) return BigInt(ai);
      if (ai === 24) { need(1); return BigInt(buf[at++]); }
      if (ai === 25) { need(2); const x = buf.readUInt16BE(at); at += 2; return BigInt(x); }
      if (ai === 26) { need(4); const x = buf.readUInt32BE(at); at += 4; return BigInt(x); }
      if (ai === 27) { need(8); const x = buf.readBigUInt64BE(at); at += 8; return x; }
      throw new Error('cbor: indefinite or reserved length');
    };
    if (major === 0) { const n = arg(); if (n > MAXBI) throw new Error('cbor: integer out of range'); return { int: n }; }
    if (major === 1) { const n = arg(); if (n >= MAXBI) throw new Error('cbor: integer out of range'); return { int: -1n - n }; }
    if (major === 2 || major === 3) {
      const n = Number(arg()); need(n); const b = buf.subarray(at, at + n); at += n;
      if (major === 2) return { bytes: Buffer.from(b) };
      return { text: new TextDecoder('utf-8', { fatal: true }).decode(b) };
    }
    if (major === 4) { const n = Number(arg()); const a = []; for (let i = 0; i < n; i++) a.push(item(depth + 1)); return { array: a }; }
    if (major === 5) { const n = Number(arg()); const m = []; for (let i = 0; i < n; i++) { const k = item(depth + 1); m.push([k, item(depth + 1)]); } return { map: m }; }
    if (major === 6) throw new Error('cbor: tags are refused');
    if (ai === 20) return { bool: false };
    if (ai === 21) return { bool: true };
    throw new Error('cbor: null, undefined, floats and other simple values are refused');
  };
  const out = item(0);
  if (at !== buf.length) throw new Error('cbor: bytes follow the item');
  return out;
}
function cbIn(v, path) {
  if ('bool' in v) return v.bool;
  if ('int' in v) return Number(v.int);
  if ('text' in v) return v.text;
  if ('array' in v) return v.array.map(x => cbIn(x, [...path, '[]']));
  if ('bytes' in v) {
    const kind = cbKind(path), b = v.bytes;
    if (kind === 'hash' && b.length === 32) return b.toString('hex');
    if (kind === 'sign') return (b.length === 32 ? Buffer.concat([STD_PREFIX, b]) : b).toString('hex');
    if (kind === 'enc' && (b.length === 32 || b.length === 65)) return b.toString('hex');
    if (kind === 'nonce' && b.length === 16) return b.toString('hex');
    throw new Error('cbor: a byte string where the protocol has none: ' + path.join('.'));
  }
  const here = timePlace(path), out = {};
  const name = k => 'text' in k ? k.text : 'int' in k && k.int >= 0n && Number(k.int) < CB.keys.length ? CB.keys[Number(k.int)] : (() => { throw new Error('cbor: a key outside the table'); })();
  for (const [k, x] of v.map) {
    const n = name(k);
    if (Object.hasOwn(out, n)) throw new Error('cbor: duplicate key');
    const p = [...path, n];
    if (path.length === 0 && n === 'type' && 'int' in x) out[n] = TYPE_INDEX[Number(x.int)];
    else if (here && TIME_FIELDS.includes(n) && 'int' in x) { const ms = Number(x.int); if (!(ms >= -62167219200000 && ms <= 253402300799999)) throw new Error('cbor: a time outside the years 0000 to 9999'); out[n] = new Date(ms).toISOString(); }
    else if (here && n === 'when' && 'map' in x) {
      const w = {};
      for (const [wk, wv] of x.map) { const wn = name(wk); if (wn in w) throw new Error('cbor: duplicate key'); w[wn] = (wn === 'from' || wn === 'to') && 'int' in wv ? new Date(Number(wv.int)).toISOString() : cbIn(wv, [...p, wn]); }
      out[n] = w;
    } else out[n] = cbIn(x, p);
  }
  return out;
}
// cbor_decode(bytes or hex, held?) -> { hash, type, state, refs, signature }; the id is the hash of the rebuilt canonical JSON, in the suite of the
// key that signed it (core.md, section 2): with held, the author's key that opens it; without, the suite the block shows. Nothing follows the signature.
function cborDecode(input, held) {
  const buf = Buffer.isBuffer(input) || input instanceof Uint8Array ? Buffer.from(input) : Buffer.from(input, 'hex');
  const m = cbRead(buf);
  if (!('array' in m) || m.array.length !== 3 || !('int' in m.array[0]) || !('map' in m.array[1]) || !('bytes' in m.array[2])) throw new Error('cbor: a message is [t, block, signature]');
  const t = Number(m.array[0].int);
  if (t !== 0 && t !== CB.table) throw new Error('cbor: a key table this reader does not have');
  if (m.array[2].bytes.length < 64) throw new Error('cbor: a signature is 64 bytes (a passkey\'s, longer)');
  const b = cbIn(m.array[1], []);
  if (Object.keys(b).sort().join() !== 'refs,state,type' || !isObj(b.state) || !isObj(b.refs) || !isStr(b.type) || b.type === '') throw new Error('cbor: a block is { type, state, refs }');
  const out = { ...b, signature: m.array[2].bytes.toString('hex') };
  return { hash: idOf(out, held), ...out };
}
function cborHeader(h, short) { // a chain header { author, seq, prev, hash }: ids as bytes
  const key = k => cbKey(k, short);
  const val = (k, x) => k === 'seq' ? { int: BigInt(x) } : (k === 'skip') ? { bool: x } : RX.hash.test(x) ? { bytes: Buffer.from(x, 'hex') } : { text: x };
  return cbEnc({ map: Object.entries(h).map(([k, x]) => [key(k), val(k, x)]) });
}
function cborHeaderDecode(input) {
  const m = cbRead(Buffer.isBuffer(input) ? input : Buffer.from(input, 'hex'));
  if (!('map' in m)) throw new Error('cbor: a header is a map');
  const out = {};
  for (const [k, x] of m.map) {
    const n = 'text' in k ? k.text : CB.keys[Number(k.int)];
    out[n] = 'int' in x ? Number(x.int) : 'bool' in x ? x.bool : 'bytes' in x ? x.bytes.toString('hex') : x.text;
  }
  return out;
}
function cborEncodePush(blocks, short) { return cbEnc({ array: blocks.map(b => ({ raw: cborEncode(b, short) })) }); }
function cborDecodePush(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'hex');
  // split the array of messages: read the outer head, then each message's extent
  const m = cbRead(buf);
  if (!('array' in m)) throw new Error('cbor: a push is an array of messages');
  const out = []; let at = 0;
  const head = buf[0], n = head & 31;
  at = n < 24 ? 1 : n === 24 ? 2 : n === 25 ? 3 : 5;
  for (let i = 0; i < m.array.length; i++) {
    let end = at;
    // find the extent by re-reading item by item
    const probe = (start) => { for (let e = start + 1; e <= buf.length; e++) { try { cbRead(buf.subarray(start, e)); return e; } catch (err) { /* try longer */ } } throw new Error('cbor: bad push'); };
    end = probe(at);
    out.push(cborDecode(buf.subarray(at, end)));
    at = end;
  }
  return out;
}

// ================================================================ what counts in a fold (core.md invariant 3, folds.md, A fork is a burden)
// A block counts in a fold when its author's identity says a key that speaks signed it, and it is not one of a pair that name
// one prev nor a later block of the same key.
function signerKeyOf(b, pool) {
  const idf = identityFold(b.refs.author, pool);
  const i = idf.info.get(b.hash);
  if (i) return i.key;
  // not yet known to the fold (e.g. a block outside the pool): the key its pieces name that opens it
  const s = signerFrom(b, pool);
  return s ? s.key : null;
}
// ---- 1.9 CORE-SET 3b-1: in its place. A key has one line. A block is in its place where its `prev` names a block of that key and its `seq` is above that block's, or, for the key's first block, where its
// `prev` names the first block that brought the key in and its `seq` is 1. A block whose `prev` is not held is not shown ('hole'), never out of place. A block whose `prev` names a block of the key with a `seq`
// not below its own, or the first bringer with a `seq` other than 1, is out of its place ('out_of_place'). A block whose `prev` names anything else (a later key grant that brings in the same key, another key's
// block) is off the line ('off'): it is no block of the line and forms no pair. `depth` numbers the steps along the line by `prev` (a fold reads a line in `prev` order; `seq` never orders it).
// 1.9 3b (decided, CORE-SET "What building changed"): of several key grants that bring one key in, the first is the one the others have in their causal past; where no one is first (two apart), none starts the line.
function lineInfoOf(pool) {
  if (pool._li) return pool._li;
  const memo = new Map(), visiting = new Set(), firsts = new Map();
  const bodyAt = h => (pool.body ? pool.body(h) : pool.get(h));
  const seqOf = b => (b && b.state && Number.isInteger(b.state.seq) ? b.state.seq : 0);
  const firstBringer = (author, key) => {
    const k = author + '|' + key;
    if (firsts.has(k)) return firsts.get(k);
    const bs = [];
    for (const e of pool.all()) { const x = bodyAt(e.hash); if (x && (x.hash === author || keyGrantOf(x, author)) && keysBroughtBy(x, author).some(y => y.key === key)) bs.push(x); }
    const mins = bs.filter(x => !bs.some(y => y !== x && pool.sees(x.hash, y.hash)));
    const out = mins.length === 1 ? mins[0] : null;
    firsts.set(k, out);
    return out;
  };
  const keyOf = b => { const k = signerKeyOf(b, pool); return k === null || k === undefined ? null : k; };
  const place = b => {
    if (memo.has(b.hash)) return memo.get(b.hash);
    if (visiting.has(b.hash)) return { s: 'off', depth: 0 };
    visiting.add(b.hash);
    let r;
    const key = keyOf(b), p = isStr(b.refs.prev) ? pool.get(b.refs.prev) : null;
    if (!p) r = { s: 'hole', depth: 0, lacks: b.refs.prev };
    else if (isObj(p.refs) && p.refs.author === b.refs.author && p.hash !== b.refs.author && key !== null && keyOf(p) === key) {
      const sub = place(p);
      // 3b-1 reads a block's place from its own `prev` alone: one whose prev is a block of its key with a lower seq is in its place, whatever
      // that block's own place (end pass 2026-11-20, as the core reads it); a hole further back is still a hole
      r = seqOf(b) > seqOf(p) ? { s: sub.s === 'out_of_place' || sub.s === 'off' ? 'on' : sub.s, depth: sub.depth + 1, lacks: sub.lacks } : { s: 'out_of_place', depth: sub.depth + 1 };
    } else {
      const F = key === null ? null : firstBringer(b.refs.author, key);
      r = F && p.hash === F.hash ? (seqOf(b) === 1 ? { s: 'on', depth: 0 } : { s: 'out_of_place', depth: 0 }) : { s: 'off', depth: 0 };
    }
    visiting.delete(b.hash);
    memo.set(b.hash, r);
    return r;
  };
  pool._li = { of: b => (isObj(b.refs) && isStr(b.refs.author) && isStr(b.refs.prev) ? place(b) : { s: 'off', depth: 0 }) };
  return pool._li;
}
// Two headers prove a pair as well as two bodies (folds.md, A fork is a burden); a block counts toward a pair when the identity fold says its key spoke for its author, a header as well as a whole block.
// A pair: two blocks of one key that name one prev or state one seq (core.md, invariant 3), both speaking for their author: a block that does not count for its author (a key that does not
// speak, a block a suite move cut) forms no pair, and neither does a block whose key cannot be told. It needs no line: the two blocks, or their two headers, are the whole proof. Blocks
// of two keys are never a pair (the same prev named by the first blocks of two keys a list brings in is two lines).
function forkPairs(blocksIn) {
  const pool = poolOf(blocksIn);
  // read once per pool (a pool never changes): every fold that asks reads the same pairs
  if (pool._forkPairs) return pool._forkPairs.map(p => [...p]);
  const out = forkPairsIn(pool);
  pool._forkPairs = out.map(p => [...p]);
  return out;
}
function forkPairsIn(pool) {
  const groups = new Map();
  const put = (k, h) => { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(h); };
  for (const b of pool.all()) {
    if (!isStr(b.refs.author) || !isStr(b.refs.prev)) continue;
    const idf = identityFold(b.refs.author, pool);
    if (!idf.keyMap.size || idf.signed_by_author[b.hash] !== true) continue;
    const key = signerKeyOf(b, pool);
    if (!key) continue;
    if (lineInfoOf(pool).of(b).s === 'off') continue; // 3b-1: a block off the key's one line is no block of a pair
    put(b.refs.author + '|' + key + '|prev|' + b.refs.prev, b.hash);
    if (Number.isInteger(b.state.seq)) put(b.refs.author + '|' + key + '|seq|' + b.state.seq, b.hash);
  }
  return star(groups.values());
}
// the pairs that prove a group of one key's blocks on one prev or at one seq (nodes.md): a star, each block paired with the group's lowest hash; a pair found twice (one prev and one seq) once
function star(groups) {
  const pairs = new Map();
  for (const list of groups) { const g = [...new Set(list)].sort(); for (const x of g.slice(1)) pairs.set(g[0] + ',' + x, [g[0], x]); }
  return [...pairs.values()].sort((a, b) => cmp(a[0] + a[1], b[0] + b[1]));
}
// the blocks of a fork (folds.md, A fork is a burden): the pair and every block of that key whose seq is at or above the lower seq of the pair
function equivocated(pool) {
  if (pool._eq) return pool._eq;
  const out = new Set();
  const pairs = forkPairs(pool);
  for (const [a, b] of pairs) {
    const A = pool.get(a), B = pool.get(b), key = signerKeyOf(A, pool) || A.refs.author;
    out.add(a); out.add(b);
    const from = Math.min(A.state.seq || 0, B.state.seq || 0);
    // 3b-2: every block of that key whose `seq` is at or above the lower `seq` of the pair, or that has a block of the pair in its causal past
    for (const x of pool.all()) if (x.refs.author === A.refs.author && (signerKeyOf(x, pool) || x.refs.author) === key && ((x.state.seq || 0) >= from || pool.past(x.hash).has(a) || pool.past(x.hash).has(b))) out.add(x.hash);
  }
  pool._eq = out;
  return out;
}
// whether the block does not count for its author: its key does not speak for her there
function voided(b, pool) { if (pool._assumed && pool._assumed.has(b.hash)) return false; const idf = identityFold(b.refs.author, pool); return idf.keyMap.size > 0 && idf.signed_by_author[b.hash] === false; }
function counts(b, pool) {
  if (!b.refs || !isStr(b.refs.author)) return true; // actors without an author: their own genesis
  return !voided(b, pool) && !equivocated(pool).has(b.hash);
}
// a fork counts only as a burden (folds.md, A fork is a burden): a block of a forked key voids what the forker claims, never what they owe, nor what
// another built on; the callers read it where the block binds its signer or another's word stands on it
const forkedOnly = (b, pool) => equivocated(pool).has(b.hash) && !voided(b, pool);
// binds(b, pool): the block binds its signer: it counts, or it is a fork's block that is no stop or decline (which would free her by her own word)
const binds = (b, pool) => counts(b, pool) || (forkedOnly(b, pool) && b.state.status !== 'stopped' && b.state.status !== 'declined');
// builtOn(b, pool, ...except): the counted blocks of other hands that name b (any ref but their own prev), or, b being a transfer, the yes to it that
// the block they sent asked for; what they built on stands without b's signer (decision C6, d1)
const builtOn = (b, pool, ...except) => pool.all().filter(o => {
  const named = o.refs.prev !== b.hash && refIds(o).includes(b.hash), yesTo = b.type === 'transfer' && b.state.status === 'accepted' && b.refs.answers === o.hash;
  return isStr(o.refs.author) && !except.includes(o.refs.author) && o.hash !== b.hash && (named || yesTo) && counts(o, pool);
});

// ================================================================ the chain (nodes.md, folds.md)
// chain(blocks, brought_in): the blocks of one signing key (the caller passes only that key's), with the block that brought the key in (folds.md)
function chainFold(blocksIn, broughtIn) {
  const pool = new Pool(blocksIn, true); // a chain is read as given: its gaps are what it reports
  // the key's blocks are full blocks (protocol.json, door.check_chain): a header given in their place is no block of the chain (end pass 2026-11-20)
  const mine = pool.all().filter(b => b.type !== undefined && b.hash !== broughtIn && Number.isInteger(b.state.seq) && b.state.seq >= 1);
  const own = new Map(mine.map(b => [b.hash, b]));
  const sorted = mine.slice().sort((a, b) => a.state.seq - b.state.seq || byHash(a, b));
  const skip = b => b.state.skip === true;
  // the pairs (core.md, invariant 3): blocks of the key that name one prev, and blocks of the key that state one seq (two first blocks of one key state seq 1 or name one prev)
  const groups = new Map();
  // a first block takes the key's root, whichever bringer it names (folds.md, chain: it names brought_in, or, at seq 1, a block that is none of the key's
  // blocks given): first blocks are one place (end pass 2026-11-20, as the core reads it)
  const placeOf = b => (b.refs.prev === broughtIn || (b.state.seq === 1 && !own.has(b.refs.prev)) ? 'root' : b.refs.prev);
  for (const b of mine) { for (const k of ['prev|' + placeOf(b), 'seq|' + b.state.seq]) { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(b.hash); } }
  const pairs = star(groups.values());
  const inPair = new Set(pairs.flat());
  const gaps = [];
  const skips = mine.filter(skip).map(b => b.hash).sort();
  // a gap: a seq missing before a seq whose blocks are not all skips; the lowest limits.gaps_max are listed (a block may say seq 2^53 - 1)
  const seqs = [...new Set(sorted.map(b => b.state.seq))];
  let last = 0;
  for (const n of seqs) {
    const explained = mine.filter(b => b.state.seq === n).every(skip);
    if (n > last + 1 && !explained) for (let m = last + 1; m < n && gaps.length < P.limits.gaps_max; m++) gaps.push(m);
    last = n;
  }
  // broken (1.9 3b-1): a block out of its place: its prev names a block of the key whose seq is not below its own, or the block that brought the key in with a seq other than 1. A prev not held is not shown,
  // never out of place; a seq that jumps with no skip is no hole (folds.md, A line)
  const broken = mine.filter(b => {
    const p = b.refs.prev;
    if (p === broughtIn) return !(b.state.seq === 1);
    const q = own.get(p);
    if (!q) return false;
    return !(b.state.seq > q.state.seq);
  }).map(b => b.hash).sort();
  // blocks counted: all but the members of a pair (a later block of the key counts: folds.md, A fork is a burden)
  const top = seqs.length ? seqs[seqs.length - 1] : null, atTop = mine.filter(b => b.state.seq === top);
  // head: the block with the highest seq, or null when two share it (folds.md)
  return {
    head: atTop.length === 1 ? atTop[0].hash : null, length: mine.filter(b => !inPair.has(b.hash)).length, gaps, skips, equivocations: pairs, broken,
    ok: !gaps.length && !pairs.length && !broken.length,
  };
}
const nextLink = (headBlock, bringer) => headBlock ? { seq: headBlock.state.seq + 1, prev: headBlock.hash } : { seq: 1, prev: bringer };
// the public header (privacy.md): { author, seq, prev, hash }, with `key` when the block names one, and skip when it says so. Of a block held by its header, its own.
const header = b => { const h = { author: b.refs.author, seq: b.state.seq, prev: b.refs.prev, hash: b.hash }; const k = keyRefOf(b); if (k !== undefined) h.key = k; if (b.state.skip === true) h.skip = true; return h; };

// ---- pull filter (nodes.md): exact match on type, kind, author, hash, record, marks and refs; keys AND together
function matches(b, filter, heldIn) {
  const pool = poolOf(heldIn);
  if (filter !== undefined && filter !== null && !isObj(filter)) return false; // a filter that is not an object matches nothing: never fails open
  for (const [k, v] of Object.entries(filter || {})) {
    if (k === 'type') { if (b.type !== v) return false; }
    else if (k === 'kind') { if (b.state.kind !== v) return false; }
    else if (k === 'author') { if (b.refs.author !== v) return false; }
    else if (k === 'hash') { if (b.hash !== v) return false; }
    else if (k === 'record') {
      let cur = b, n = 0, ok = false;
      while (cur && n++ < 1000) { if (cur.hash === v) { ok = true; break; } cur = cur.refs.updates ? pool.get(cur.refs.updates) : null; }
      if (!ok) return false;
    } else if (k === 'marks') { if (!isObj(v) || !asList(b.state.marks).some(m => isObj(m) && m.scheme === v.scheme && m.value === v.value)) return false; }
    else if (k === 'refs') { if (!isObj(v)) return false; for (const [rk, rv] of Object.entries(v)) if (!isStr(rv) || !asList(b.refs[rk]).includes(rv)) return false; }
    else return false; // a key the filter does not know matches nothing
  }
  return true;
}

// ---- a push (nodes.md, Push): every block is judged on its pieces against what the node holds and the rest of the push, in no rounds, so what is taken never depends on
// the order of a push. One whose pieces are not all there (or whose suite this node does not know) is unjudged, kept and counted in no fold; a valid block is taken; it is then
// read, and one that is not read is listed in `unread` with its codes and held as its header. Two blocks of one key on one prev or at one seq are both kept and listed as a pair:
// the node's own stated choice (takesPairs) says whether the blocks of a pair are taken; if not, none of the push's blocks of a pair is, and such a block is neither refused
// nor unjudged. A pair is a star: each block of the push paired with the lowest hash of its group (folds.md, nodes.md).
const PAIR_CODES = ['unmet', 'unknown_suite'];
// A block whose body is held, and a header that describes a body held, are nothing new and are listed nowhere; a header that does not is `bad_hash` (privacy.md, The public header).
// `unread` lists whole blocks only (a header is not read). An id sent with a block is replaced by the id a reader computes; an unjudged block waiting only on a suite needs [] (nodes.md, Push).
function accept(incomingIn, heldIn, takesPairs, schemas, keep) {
  const held = normEntries(heldList(heldIn)), refused = [], whole = [], headers = [], wrappedIn = [];
  const open = new Pool([...held, ...normEntries((incomingIn || []).filter(x => isObj(x) && x.type !== undefined))], true); // bodies, to read the suite of the key that signed each
  for (const x of incomingIn || []) {
    if (!isObj(x)) { refused.push({ hash: '', code: 'shape', detail: 'a message is a block or a sealed block' }); continue; }
    // 1.9 stage 7 (A2, A6): a wrapped copy is { mailbox, envelope }: no block to judge, a host sees only the mailbox, its size and when; whether it keeps it is its admission rule
    // (stage 7 compare: the core's shape) it is set aside only where the node states an admission rule or names the push; else it is no block, and refused as any other
    if (keep && Object.keys(x).length === 2 && isStr(x.mailbox) && isObj(x.envelope)) { wrappedIn.push(x); continue; }
    if (x.type === undefined && x.state === undefined && 'header' in x) {
      // a sealed message: { header, header_signature, envelope }; one that carries a version is refused (privacy.md, Sealed messages)
      if (x.version !== undefined) { refused.push({ hash: '', code: 'shape', detail: 'a sealed block carries no version: it is { header, header_signature, envelope }' }); continue; }
      const e = headerEntry(x);
      if (!e) { refused.push({ hash: '', code: 'shape', detail: 'a sealed block is { header, header_signature, envelope }' }); continue; }
      headers.push(e); continue;
    }
    // a block whose state or refs is not an object is judged by valid as any other (not_canonical: core.md section 8, the bytes), under the id its
    // bytes give (end pass 2026-11-20, as the core judges it; it was refused `shape` under the id it was sent)
    if (x.type !== undefined && (!isObj(x.state) || !isObj(x.refs))) { const f = valid(x, []); let h = ''; try { h = hashOfBlock(blockOnly(x), 'std'); } catch { h = isStr(x.hash) ? x.hash : ''; } refused.push({ hash: h, code: (f[0] || {}).code || 'not_canonical', detail: (f[0] || {}).detail || 'state and refs are objects' }); continue; }
    if (x.type === undefined || !isObj(x.state) || !isObj(x.refs)) { refused.push({ hash: isStr(x.hash) ? x.hash : '', code: 'shape', detail: 'a message is a block or a sealed block' }); continue; }
    // a block's id is the one a reader that holds its pieces computes, in the suite of the key that signed it (core.md, section 2)
    const s = isStr(x.refs.author) ? signerFrom(x, open) : null;
    const computed = hashOfBlock(blockOnly(x), (s && s.suite) || suiteFromBlock(blockOnly(x)));
    // never the id it was sent: a node computes the id itself (the vectors' canonical/relabel case)
    whole.push({ ...x, hash: computed });
  }
  // copies of one block (one id once computed so) are taken once, the lowest signature only to name one
  // 1.9 3a-8: where one hash comes more than once in one push, each copy is judged and the valid one is kept: the order of arrival never changes what is taken.
  // 1.9 3a (decided, CORE-SET "What building changed"): where no copy is valid, the copy with the lowest signature is the one refused (one refusal for the id)
  const byId = new Map(), copies = new Map();
  for (const b of whole.sort((p, q) => cmp(p.hash, q.hash) || cmp(String(p.signature), String(q.signature)))) { if (!copies.has(b.hash)) copies.set(b.hash, []); copies.get(b.hash).push(b); if (!byId.has(b.hash)) byId.set(b.hash, b); }
  for (const [h, list] of copies) if (list.length > 1) {
    const rest = [...byId.values()].filter(x => x.hash !== h);
    const good = list.find(c => { const c2 = { idx: buildIdx([...held, ...rest, c]), memo: new Map(), stack: new Set() }; return judge(c, c2, true).findings.length === 0; });
    if (good) byId.set(h, good);
  }
  const heldBody = new Set(held.filter(e => e.type !== undefined).map(e => e.hash));
  const heldHeader = new Map(held.filter(e => e.type === undefined).map(e => [e.hash, e]));
  const taken = [], newBlocks = [];
  // a held header that does not describe the body arriving under its hash is a lie about that hash: read as never held, and the block takes its place (privacy.md)
  const describes = (h, b) => h.refs.author === b.refs.author && h.state.seq === b.state.seq && h.refs.prev === b.refs.prev && h.keyId === b.refs.key && (h.state.skip === true) === (b.state.skip === true);
  const lies = new Set();
  for (const b of byId.values()) { if (heldBody.has(b.hash)) continue; const h = heldHeader.get(b.hash); if (h && !describes(h, b)) lies.add(b.hash); newBlocks.push(b); }
  // the other half of a block held: a header whose body is held describes it exactly, or is refused
  const newHeaders = [];
  for (const e of [...new Map(headers.map(h => [h.hash, h])).values()].sort(byHash)) {
    const body = held.find(x => x.type !== undefined && x.hash === e.hash) || byId.get(e.hash);
    if (body) { if (!describes(e, body)) refused.push({ hash: e.hash, code: 'bad_hash', detail: 'the header does not describe the block held under this hash' }); continue; } // one that does is nothing new (privacy.md)
    if (heldHeader.has(e.hash)) continue; // the same header again adds nothing
    newHeaders.push(e);
  }
  const judging = [...newBlocks, ...newHeaders];
  const base = [...held.filter(e => !lies.has(e.hash)), ...judging];
  const ctx = { idx: buildIdx(base), memo: new Map(), stack: new Set() };
  const unjudged = [], good = [];
  for (const e of judging) {
    const r = judge(ctx.idx.get(e.hash) || e, ctx);
    if (!r.findings.length) good.push(e);
    else if (r.findings.every(f => PAIR_CODES.includes(f.code))) unjudged.push({ hash: e.hash, needs: r.needs });
    else for (const f of inCodeOrder(r.findings)) refused.push({ hash: e.hash, code: f.code, detail: f.detail });
  }
  // the pairs of the store once the push is taken: those a block of this push belongs to
  const goodSet = new Set(good.map(e => e.hash));
  const after = classify([...held.filter(e => !lies.has(e.hash)), ...good]);
  const pairsAll = forkPairs(new Pool([...after.m.values()], true));
  const equivocations = pairsAll.filter(p => p.some(h => goodSet.has(h)));
  const forked = new Set(equivocations.flat().filter(h => goodSet.has(h)));
  for (const e of good) if (takesPairs || !forked.has(e.hash)) taken.push(e);
  // read: each block taken is read against what is held, or is kept as its header
  const finalSet = new Set(taken.map(e => e.hash));
  const r = classify([...held.filter(e => !lies.has(e.hash)), ...taken.filter(e => e.type !== undefined || !heldBody.has(e.hash))], { schemas: Array.isArray(schemas) ? normHeld(schemas) : undefined });
  const unread = taken.filter(e => e.type !== undefined && r.codes.has(e.hash)).map(e => ({ hash: e.hash, codes: r.codes.get(e.hash).map(c => c.code) }));
  const asc = (a, b) => cmp(a.hash, b.hash);
  const res = {
    taken: [...new Map(taken.map(e => [e.hash, e])).values()].sort(asc), unjudged: unjudged.sort(asc), refused: refused.sort((a, b) => cmp(a.hash, b.hash) || CODE_ORDER.indexOf(a.code) - CODE_ORDER.indexOf(b.code)),
    unread: unread.sort(asc), equivocations, false_headers: [...lies].filter(h => finalSet.has(h)).sort(),
  };
  // 1.9 stage 7 (A2, A6), in the core's shape (stage 7 compare, settled): the node's admission rule `copies: { signed?, handed_on?, unsigned?, mailboxes? }` and the push `{ signer?, for? }`.
  // A rule that states nothing keeps no copy. `copies` lists each sealed copy kept, taken or held, for the readers the push names: from `author` (a signed push by its author, under `signed`) or
  // `handed_on` (a signed push by anyone else under `handed_on`, or an unsigned one under `unsigned`; never in the author's place); `wrapped` what it holds of a wrapped copy to a mailbox the rule names
  if (keep) {
    const rule = isObj(keep.rule) ? keep.rule : {}, push = isObj(keep.push) ? keep.push : {};
    const says = k => rule[k] === true, mail = Array.isArray(rule.mailboxes) ? rule.mailboxes.filter(isStr) : [];
    const heldH = new Set(held.map(e => e.hash)), forW = isObj(push.for) ? push.for : {};
    const copies = [];
    for (const x of incomingIn || []) {
      if (!isObj(x) || x.type !== undefined || !isObj(x.header) || x.envelope === undefined) continue;
      const hash = x.header.hash;
      if (!(finalSet.has(hash) || heldH.has(hash))) continue;
      const readers = Array.isArray(forW[hash]) ? forW[hash].filter(isStr) : [];
      if (!readers.length) continue;
      const from = isStr(push.signer) ? (push.signer === x.header.author ? (says('signed') ? 'author' : null) : (says('handed_on') ? 'handed_on' : null)) : (says('unsigned') ? 'handed_on' : null);
      if (from) copies.push({ hash, for: readers, from });
    }
    res.copies = copies.sort(asc);
    res.wrapped = wrappedIn.filter(m => mail.includes(m.mailbox)).map(m => ({ mailbox: m.mailbox, bytes: wrappedSeen(m).bytes })).sort((a, b) => cmp(a.mailbox, b.mailbox) || a.bytes - b.bytes);
  }
  return res;
}

// A block's causal past through the blocks given (sorted): every block reachable by prev, after and every other ref, and by counted_to.
function pastOfBlock(block, blocks) {
  const pool = new Pool(blocks, true);
  const seen = new Set(), stack = refIds(block);
  for (const h of stack) seen.add(h);
  while (stack.length) { const b = pool.get(stack.pop()); if (!b) continue; for (const r of refIds(b)) if (!seen.has(r)) { seen.add(r); stack.push(r); } }
  return [...seen].sort();
}
// ================================================================ authority (authority.md)
// the names a block's type answers to in a grant's scope.types (authority.md): its type, and type.kind when its kind is text
const typeNames = b => isStr(b.state.kind) ? [b.type, b.type + '.' + b.state.kind] : [b.type];
// whether a block's author receives a grant: open (no refs.to), or made to them. A to that is not one id names no one (roles are gone with 06-circles.md).
function receives(g, b, pool) {
  return receivesAs(g, b.refs.author);
}
function receivesAs(g, who) {
  if (g.refs.to === undefined) return true;
  if (!isStr(g.refs.to) || g.refs.to === '') return false;
  return g.refs.to === who;
}
// ended(g, pool, count, seen): a grant ends at a counted stop by its grantor (its author, or, for a grant signed as a circle, one who may sign for it), or
// a decline or leaving by its receiver; only for the blocks that see the stop (seen), as a death ends it (authority.md, Ending)
function ended(g, pool, count = b => counts(b, pool), seen = () => true) {
  return pool.all().some(u => ((u.type === 'grant' && ['stopped', 'declined'].includes(u.state.status)) || isDeclineReading(u)) && count(u) && seen(u.hash) && (
    (u.refs.updates === g.hash && ((u.refs.author === g.refs.author && u.refs.as === undefined && (g.refs.as === undefined || stillHolds(u, g.refs.as, pool))) || (g.refs.as === undefined && u.refs.author === g.refs.author) || (g.refs.as !== undefined && u.refs.as === g.refs.as && mayActAsIn(u, g.refs.as, pool)))) ||
    (u.refs.updates === g.hash && isStr(g.refs.to) && u.refs.author === g.refs.to && g.refs.as !== undefined && u.refs.as === undefined) || // C14: a holder may always end her own place under it
    (u.refs.answers === g.hash && isStr(g.refs.to) && u.refs.author === g.refs.to)));
}
// A grant is live only while every ancestor grant is live (invariant 9). For a block that relies on it, a death ends it only when the close is in that
// block's causal past.
function grantLive(g, pool, seen = new Set(), relying) {
  if (!g || g.type !== 'grant' || seen.has(g.hash)) return false;
  seen.add(g.hash);
  // a block with a status is a stop or an answer, never a grant (authority.md); a stop or a decline ends it for the blocks that see it (Ending)
  const seenBy = grantSeenBy(g, pool, relying); // 1.9 stage 4 (G16): a stop is seen by a block that has it in its past, or where the grant names clocks, by the lines
  if (g.state.status !== undefined || !binds(g, pool) || ended(g, pool, undefined, seenBy)) return false;
  if (endsOnReached(g, pool, seenBy)) return false; // 1.9 (O2): her own ending term, read in causal order as her own stop is
  // a block dated (its own at) at or after the grant's scope.until acts under no grant (decision D14): its signer's own date says the grant had run out
  if (relying && ranOut(g, relying)) return false; // 1.9 3d-2: a missing `at` reads the same in every part: under a grant with `until`, as under any stated end, it is not in time
  // a grant signed as a circle gives the circle's authority only when its signer may sign for it there, with the hands it needs; for a block that
  // relies on it, only the confirms in that block's causal past count (circles.md, Many hands)
  if (g.refs.as !== undefined) {
    // 1.9 stage 6: for a block that relies on it, only the hands in that block's causal past count (a move holds at a block, in whose causal past enough hands count: C15)
    if (relying) { if (!circleHoldsWithin(g, pool, pool.past(relying.hash))) return false; }
    else if (principalOf(g, pool) === null) return false;
  }
  if (g.refs.parent !== undefined) return grantLive(pool.get(g.refs.parent), pool, seen, relying);
  return true;
}
// ================================================================ 1.9 stage 4: grants (changes-1.9/04-grants.md; authority.md)
// What a tool may do for her. One rule (G1) says whether a block under a grant speaks for the giver; the rest is its parts: Keeps to (G3, G4), the line a limit is counted on (G6 to G9),
// the pass between her tools (G13), the deadline and the lowest offer (G15), the stop (G16), the worst case (G18). Nothing here fills in a silence.
const S4_PLACES = ['price', 'quantity', 'pay_by', 'deliver_by']; // protocol.json `set_places` (the term places; a line's price and quantity are read the same way)
const S4_BASE = '2000-01-01T00:00:00.000Z'; // durations are compared by adding both to one instant (core.md, section 3)
const isRangeV = v => isObj(v) && Object.keys(v).length > 0 && Object.keys(v).every(k => k === 'min' || k === 'max');
const isListV = v => isObj(v) && Object.keys(v).length === 1 && 'one_of' in v;
const isRL = v => isRangeV(v) || isListV(v);
// a plain value at a place: { kind, n } (n an exact fraction) or null. Kinds never mix: an amount's unit and `of`, a price's per byte for byte, a time, a duration.
function placeValue(v) {
  if (isStr(v)) {
    if (timeProblem(v) === null) return { kind: 'time', n: { n: BigInt(Date.parse(v)), d: 1n } };
    if (parseDur(v)) { const t = addDur(S4_BASE, v); return t === null ? null : { kind: 'duration', n: { n: BigInt(Date.parse(t)), d: 1n } }; }
    return null;
  }
  if (isObj(v) && shapeOf(v) === 'amount' && !amountProblem(v)) return { kind: 'amount:' + jcs(kindOf(v)), n: dec(v.value) };
  if (isObj(v) && shapeOf(v) === 'price_per' && priceProblems(v).length === 0) return { kind: 'price:' + jcs(kindOf(v.amount)) + '/' + jcs(v.per), n: dec(v.amount.value) };
  return null;
}
// a range { min, max } (one end or both, of one kind, min less than max) or a list { one_of } (two or more values, of one kind, sorted): `shape` or null
function rangeListProblem(v) {
  if (isRangeV(v)) {
    const ends = ['min', 'max'].filter(k => k in v).map(k => placeValue(v[k]));
    if (ends.some(e => e === null) || ends.some(e => e.kind !== ends[0].kind)) return 'shape';
    if (ends.length === 2 && fcmp(ends[0].n, ends[1].n) >= 0) return 'shape';
    return null;
  }
  if (isListV(v)) {
    const l = v.one_of;
    if (!Array.isArray(l) || l.length < 2) return 'shape';
    const vs = l.map(placeValue);
    if (vs.some(e => e === null) || vs.some(e => e.kind !== vs[0].kind)) return 'shape';
    for (let i = 1; i < vs.length; i++) if (fcmp(vs[i - 1].n, vs[i].n) >= 0) return 'shape';
    return null;
  }
  return 'shape';
}
// a plain value is inside a range or a list: of the same kind, from min to max (both counted), or equal to a listed number. Where the promise repeats, a duration end is added to the start of the occurrence C names.
function insideRL(a, c, occurrence) {
  const cv = placeValue(c);
  if (cv === null) return false;
  const endOf = e => { const pv = placeValue(e); if (pv && pv.kind === 'duration' && cv.kind === 'time' && occurrence) { const t = addDur(occurrence, e); return t === null ? null : { kind: 'time', n: { n: BigInt(Date.parse(t)), d: 1n } }; } return pv; };
  if (isRangeV(a)) {
    for (const k of ['min', 'max']) {
      if (!(k in a)) continue;
      const e = endOf(a[k]);
      if (!e || e.kind !== cv.kind || (k === 'min' ? fcmp(cv.n, e.n) < 0 : fcmp(cv.n, e.n) > 0)) return false;
    }
    return true;
  }
  return Array.isArray(a.one_of) && a.one_of.some(x => { const e = endOf(x); return !!e && e.kind === cv.kind && fcmp(cv.n, e.n) === 0; });
}
// ---- Keeps to (authority.md, Blocks that bind): a promise C keeps to a promise A when C's state and refs are A's key for key, bar a closed list of eight.
// { keeps, why }: `why` the first sorted path that differs and is not one of the eight. ctx: { principal, parties } (what item 4 and item 7 need).
// 1.9 stage 4 (decided in building): a path under `terms` is written `terms.price`, any other state field `state.where`, a ref `refs.what`, a line's term `terms.lines.<id>.price` (the text's own two spellings).
// 1.9 stage 4 (decided in building): `state.draws` is a field a tool's block carries of its own (item 1), and `state.audience` is left out of the comparison (item 2: a sealed list cannot be checked here).
function keepsTo(C, A, pool, ctx, depth) {
  ctx = ctx || {}; depth = depth || 0;
  const diffs = new Set(), d = p => diffs.add(p), same = (x, y) => (x === undefined || y === undefined ? x === y : jcs(x) === jcs(y));
  const ownR = ['author', 'prev', 'after', 'key', 'answers', 'under', 'as']; // 1.9 stage 6 (D2): `as` is the block's own, like `author`: a circle's want can be kept to by the other side, and a tool can buy for a circle
  const isKindId = h => { const t = pool.get(h); return !!t && (pool.all().some(x => x.refs && x.refs.of === h) || t.state.kind === 'kind'); };
  const whatKeeps = (a, c) => {
    if (a === undefined || c === undefined) return false;
    const as = asList(a), cs = asList(c);
    if (as.length && as.every(isKindId)) return cs.length > 0 && cs.every(h => { const t = pool.get(h); return !!t && as.includes(t.refs.of); }) && as.every(k => cs.some(h => { const t = pool.get(h); return !!t && t.refs.of === k; }));
    return same([...as].sort(), [...cs].sort());
  };
  const occ = isStr(C.state.occurrence) && timeProblem(C.state.occurrence) === null ? C.state.occurrence : null;
  const aT = isObj(A.state.terms) ? A.state.terms : {}, cT = isObj(C.state.terms) ? C.state.terms : {};
  const placeKeeps = (k, a, c, p) => {
    if (c === undefined) { if (a !== undefined) d(p); return; }
    if (isRL(c)) { d(p); return; }
    if (a === undefined) {
      // item 7: a price, where A states none, she pays it, and the other side signs C
      if (k === 'price' && ctx.principal && C.refs.to === ctx.principal && C.hash !== undefined && speakerOf(C, pool) !== ctx.principal) return;
      d(p); return;
    }
    if (isRL(a)) { if (!insideRL(a, c, occ)) d(p); return; }
    if (!same(a, c)) d(p);
  };
  for (const k of new Set([...Object.keys(A.refs), ...Object.keys(C.refs)])) {
    if (ownR.includes(k)) continue;
    const a = A.refs[k], c = C.refs[k];
    if (k === 'for') { for (const h of asList(c)) { if (h === A.hash) continue; const x = pool.get(h); if (!(x && x.type === 'promise' && depth < 8 && keepsTo(x, A, pool, ctx, depth + 1).keeps)) d('refs.for'); } continue; }
    if (k === 'from' || k === 'to') {
      if (a === undefined) { if (c === undefined) d('refs.' + k); else if (asList(ctx.parties).length && c !== ctx.principal && !ctx.parties.includes(c)) d('refs.' + k); }
      else if (!same(a, c)) d('refs.' + k);
      continue;
    }
    if (k === 'what') { if (!whatKeeps(a, c)) d('refs.what'); continue; }
    if (!same(a, c)) d('refs.' + k);
  }
  for (const k of new Set([...Object.keys(A.state), ...Object.keys(C.state)])) {
    if (['seq', 'at', 'nonce', 'skip', 'audience', 'draws', 'terms'].includes(k)) continue;
    if (k === 'occurrence') { if (C.state.occurrence !== undefined && aT.repeat === undefined) d('state.occurrence'); continue; }
    if (!same(A.state[k], C.state[k])) d('state.' + k);
  }
  for (const k of new Set([...Object.keys(aT), ...Object.keys(cT)])) {
    if (k === 'expires') continue;
    if (k === 'lines') {
      const al = asList(aT.lines), cl = asList(cT.lines);
      for (const id of new Set([...al, ...cl].map(l => (isObj(l) ? l.id : undefined)))) {
        const x = al.find(l => isObj(l) && l.id === id), y = cl.find(l => isObj(l) && l.id === id);
        if (!x || !y) { d('terms.lines.' + id); continue; }
        for (const f of new Set([...Object.keys(x), ...Object.keys(y)])) { if (f === 'price' || f === 'quantity') placeKeeps(f, x[f], y[f], 'terms.lines.' + id + '.' + f); else if (!same(x[f], y[f])) d('terms.lines.' + id + '.' + f); }
      }
      continue;
    }
    if (S4_PLACES.includes(k)) { placeKeeps(k, aT[k], cT[k], 'terms.' + k); continue; }
    if (!same(aT[k], cT[k])) d('terms.' + k);
  }
  const first = [...diffs].sort()[0];
  return { keeps: diffs.size === 0, why: first === undefined ? null : first };
}

// ---- the grant, its chain and what a block under it is
const scopeOf = g => (isObj(g.state.scope) ? g.state.scope : {});
const limitOf = g => { const l = scopeOf(g).limit; return isAmount(l) ? l : null; };
const eachOf = g => { const l = scopeOf(g).each; return isAmount(l) ? l : null; };
function grantChain(g, pool) { const out = [g]; for (let x = g, i = 0; i < 64; i++) { const up = x.refs.parent === undefined ? null : pool.get(x.refs.parent); if (!up || up.type !== 'grant') break; out.push(up); x = up; } return out; }
// the kind of a block under a grant, for G1 (Blocks that bind): a promise (offer, want, counter), an accept (an accepted answer: her yes, an allocation), a payment or a delivery, a word about what is hers to receive, a make
function s4Kind(b) {
  if (b.type === 'promise') return b.state.status === undefined ? 'promise' : b.state.status === 'accepted' ? 'accept' : 'other';
  if (b.type === 'transfer') return b.state.status === undefined ? 'pay' : b.state.status === 'accepted' ? 'word' : 'other';
  if (b.type === 'observe') return ['received', 'covers', 'paid'].includes(b.state.kind) ? 'word' : 'other';
  if (b.type === 'transform') return 'make';
  return 'other';
}
// the promise an accept binds her to: followed through accepts (an allocation answers an accept) to the offer or counter it ends at; a promise with no status is itself; else null
function s4PromiseOf(b, pool) {
  let x = b;
  for (let i = 0; i < 16; i++) {
    if (x.type !== 'promise') return null;
    if (x.state.status === undefined) return x;
    if (x.state.status !== 'accepted') return null;
    const t = pool.get(asList(x.refs.answers)[0]);
    if (!t) return null;
    x = t;
  }
  return null;
}
// the first promise of a deal: a promise that answers nothing is it; a counter names it in refs.for
const s4Root = (p, pool) => { if (!p) return null; if (p.refs.answers === undefined) return p; const f = pool.get(asList(p.refs.for)[0]); return f && f.type === 'promise' ? f : p; };
// the deal a word, a payment or a delivery is `for`: its refs.for, its subject, or the deal the block it answers is for
function s4DealOf(b, pool) {
  const ids = [...asList(b.refs.for), ...asList(b.refs.subject)];
  for (const h of asList(b.refs.answers)) { const t = pool.get(h); if (t) ids.push(...asList(t.refs.for), ...asList(t.refs.subject)); }
  for (const h of ids) { const p = pool.get(h); if (p && p.type === 'promise') return s4Root(s4PromiseOf(p, pool) || p, pool); }
  return null;
}
// the deal a block is a draw on, for G8 (counted once): the deal's first promise
function s4DealKey(b, pool) {
  const k = s4Kind(b);
  if (k === 'promise') { const r = s4Root(b, pool); return r ? r.hash : b.hash; }
  if (k === 'accept') { const p = s4PromiseOf(b, pool); const r = p && s4Root(p, pool); return r ? r.hash : null; }
  const d = s4DealOf(b, pool); return d ? d.hash : null;
}
// two keys joined by a two-key link (identity.md, A two-key link): one writes an observe of kind `link` with `same_as` the other, and the other counter-signs with its own `link` naming the first in refs.confirms
function s4Linked(x, y, pool) {
  const links = pool.all().filter(o => o.type === 'observe' && o.state.kind === 'link' && isStr(o.refs.author) && counts(o, pool));
  return links.some(l1 => asList(l1.refs.same_as).length && [[x, y], [y, x]].some(([a, b]) => l1.refs.author === a && asList(l1.refs.same_as).includes(b) &&
    links.some(l2 => l2.refs.author === b && asList(l2.refs.same_as).includes(a) && asList(l2.refs.confirms).includes(l1.hash))));
}
// the promises of scope.on this grant holds: a grant that names A in `on` is a draw on A's quantity from her line; a second grant naming A takes only what the first left (authority.md, Her quantity is the measure)
function s4OnRows(g, pool) {
  pool._s4o = pool._s4o || new Map();
  if (pool._s4o.has(g.hash)) return pool._s4o.get(g.hash);
  pool._s4o.set(g.hash, []); // a ring reads as holding nothing
  const rows = [];
  for (const h of asList(scopeOf(g).on)) {
    const A = pool.get(h);
    if (!A || A.type !== 'promise') { rows.push({ promise: h, takes: false, why: 'not_owner' }); continue; }
    const hasQty = isObj(A.state.terms) && isAmount(A.state.terms.quantity);
    if (!hasQty || g.refs.parent !== undefined) { rows.push({ promise: h, takes: true, why: null }); continue; }
    const rivals = pool.all().filter(x => x.type === 'grant' && x.hash !== g.hash && x.state.status === undefined && x.refs.parent === undefined && x.refs.author === g.refs.author && asList(scopeOf(x).on).includes(h));
    const stopped = x => pool.all().some(s => s.type === 'grant' && s.state.status === 'stopped' && s.refs.updates === x.hash && s.refs.author === x.refs.author && counts(s, pool) && pool.sees(g.hash, s.hash));
    let takes = true;
    for (const x of rivals) {
      if (stopped(x)) continue;
      if (pool.sees(g.hash, x.hash)) { if (s4OnRows(x, pool).some(r => r.promise === h && r.takes)) takes = false; }
      else if (!pool.sees(x.hash, g.hash)) takes = false; // neither came first: neither takes (1.9 stage 4, decided in building)
    }
    rows.push({ promise: h, takes, why: takes ? null : 'past' });
  }
  pool._s4o.set(g.hash, rows);
  return rows;
}
const s4Held = (g, pool) => s4OnRows(g, pool).filter(r => r.takes).map(r => r.promise);

// ---- the line a limit is counted on (authority.md, A limit is counted along one line; 00-shared, `refs.meter`)
// { name, author, key, after, own } for the line refs.meter names, { name, missing } when the block is not held, null when the grant names none
function s4Line(g, pool) {
  const mh = g.refs.meter;
  if (!isStr(mh)) return null;
  const m = pool.get(mh);
  if (!m) return { name: mh, missing: true };
  let spec = null;
  if (m.type === 'actor' && m.refs.author === undefined) spec = { author: m.hash, key: isStr(m.state.public_key_sign) ? m.state.public_key_sign : null, after: 0 };
  else if (isKeyGrant(m) && !Array.isArray(m.state.voices) && isStr(m.state.public_key_sign) && isStr(m.refs.subject)) spec = { author: m.refs.subject, key: m.state.public_key_sign, after: 0 };
  else if (isStr(m.refs.author)) spec = { author: m.refs.author, key: signerKeyOf(m, pool), after: Number.isInteger(m.state.seq) ? m.state.seq : 0 };
  if (!spec) return { name: mh, missing: true };
  return { ...spec, name: mh, own: spec.author === g.refs.to };
}
const s4OnLine = (L, o, pool) => isObj(o.refs) && o.refs.author === L.author && o.hash !== L.name && Number.isInteger(o.state.seq) && o.state.seq > L.after && (L.key === null || signerKeyOf(o, pool) === L.key);
// a line in `prev` order (a fold reads a line in `prev` order; `seq` numbers it and never orders it)
function s4LineBlocks(L, pool) {
  const li = lineInfoOf(pool);
  return pool.all().filter(o => s4OnLine(L, o, pool)).sort((x, y) => li.of(x).depth - li.of(y).depth || pool.past(x.hash).size - pool.past(y.hash).size || cmp(x.hash, y.hash));
}
// the counted stops of a grant and of every grant it was passed on from, by their grantors
const s4Stops = (g, pool) => grantChain(g, pool).flatMap(x => pool.all().filter(s => s.type === 'grant' && s.state.status === 'stopped' && s.refs.updates === x.hash && s.refs.author === x.refs.author && counts(s, pool)));
const s4Durs = (d, e) => { const a = addDur(S4_BASE, d), b = addDur(S4_BASE, e); return a !== null && b !== null ? (a < b ? -1 : a > b ? 1 : 0) : NaN; };
// a draw's period under `every`: the periods turn at the cutoffs of the meter's line that run for at least `every` (1.9 stage 4 (decided in building): a cutoff of the grant's line is an observe of kind cutoff, refs.subject the grant, `when` a span)
function s4PeriodOf(g, L, atBlock, pool) {
  if (!isStr(scopeOf(g).every) || !L || L.missing) return null;
  const cuts = pool.all().filter(c => c.type === 'observe' && c.state.kind === 'cutoff' && asList(c.refs.subject).includes(g.hash) && isStr(c.state.when) && parseDur(c.state.when) && s4Durs(c.state.when, scopeOf(g).every) >= 0 && s4OnLine(L, c, pool));
  // before a block: in its causal past on the holder's own line; before its first receipt on another key's line
  const at = L.own ? atBlock : s4MeterReceipts(L, pool).find(r => asList(r.refs.derives_from).includes(atBlock.hash));
  return at ? cuts.filter(c => pool.sees(at.hash, c.hash)).length : 0;
}
// ---- the line a limit is counted on (authority.md, A limit is counted along one line): its measures, its draws in line order, what is left
const s4IsAccept = (b, pool) => b.state.status === 'accepted' && (b.type === 'promise' || b.type === 'observe') && (() => { const o = pool.get(asList(b.refs.answers)[0]); return !!o && o.type === 'promise'; })();
const s4Top = v => (isRL(v) ? s4Ends(v).hi : v);
// the measures of a grant's line: its `limit`; each promise of `on` (her quantity: all of it where the grant's draw on it took, else none); each instance in refs.what (the limit where it is of the instance's kind, else its pack)
function s4Measures(g, pool) {
  const out = [], limit = limitOf(g), rows = s4OnRows(g, pool);
  if (scopeOf(g).limit !== undefined) out.push({ of: g.hash, amount: limit });
  for (const h of asList(scopeOf(g).on)) {
    const A = pool.get(h);
    if (!A || A.type !== 'promise') continue;
    const q = s4Top(isObj(A.state.terms) ? A.state.terms.quantity : undefined);
    if (!isAmount(q)) continue;
    const r = rows.find(x => x.promise === h);
    out.push({ of: h, amount: r && !r.takes ? { ...q, value: '0' } : q });
  }
  for (const w of asList(g.refs.what)) { const t = pool.get(w), pack = t && isAmount(t.state.pack) ? t.state.pack : null; out.push({ of: w, amount: limit && pack && sameKind(limit, pack) ? limit : pack }); }
  return out;
}
// the promise of `on` that C keeps to: C keeps to it (Keeps to), or C is itself an accept of it (an order of an open offer: it names only the quantity it chooses, inside A's)
function s4KeptBy(C, ons, pool) {
  for (const A of ons) {
    if (s4IsAccept(C, pool) && C.refs.answers === A.hash) {
      const q = isObj(C.state.terms) ? C.state.terms.quantity : undefined, aq = isObj(A.state.terms) ? A.state.terms.quantity : undefined;
      if (q === undefined || aq === undefined || (isRL(aq) ? insideRL(aq, q) : (placeValue(q) && placeValue(aq) && placeValue(q).kind === placeValue(aq).kind && fcmp(placeValue(q).n, placeValue(aq).n) <= 0))) return A;
      continue;
    }
    if (keepsTo(C, A, pool, {}).keeps) return A;
  }
  return null;
}
// the accepts under the grant, and the deals each made (its `for`, and the offer it answers)
const s4DealsMade = (g, pool) => pool.all().filter(b => b.refs.under === g.hash && s4IsAccept(b, pool) && binds(b, pool)).map(b => [b, [...asList(b.refs.for), ...asList(b.refs.answers)]]);
// the receipts of another key's line, in line order
const s4MeterReceipts = (L, pool) => s4LineBlocks(L, pool).filter(o => o.type === 'observe' && o.state.kind === 'receipt');
// what a deal it bound comes to for her, in `kind`: the quantity where she sells or the limit is of the quantity's kind; else the total at the quantity it binds, with the backing she gives (a price fixed later is counted at its `max`); null where it cannot be worked out
function s4Binds(onTerms, qv, sells, kind) {
  if (sells || (kind && isAmount(qv) && sameKind(qv, kind))) return isAmount(qv) ? { f: dec(qv.value), kind: kindOf(qv) } : null;
  const t = isObj(onTerms.state.terms) ? onTerms.state.terms : {};
  let tot;
  if (isObj(t.price) && 'figure' in t.price) { tot = isAmount(t.price.max) && isAmount(qv) ? totalOf({ amount: t.price.max, per: t.price.per || { value: '1', unit: qv.unit } }, qv) : null; }
  else tot = termsTotalF(t, isAmount(qv) ? qv : undefined);
  if (!tot) return null;
  if (isAmount(t.backing) && sameKind(t.backing, tot.kind)) tot = { f: fadd(tot.f, dec(t.backing.value)), kind: tot.kind };
  return tot;
}
// each block counted on the line, with what it takes of each measure (in line order); `filter` false where the line is read from inside G1's own clauses
function s4Draws(g, L, pool, filter) {
  const gh = g.hash, limit = limitOf(g), each = eachOf(g), what = asList(g.refs.what), principal = principalOfChain(g, pool);
  const ons = asList(scopeOf(g).on).map(h => pool.get(h)).filter(A => A && A.type === 'promise');
  const kind = limit ? kindOf(limit) : each ? kindOf(each) : null;
  const blocks = pool.all().filter(b => {
    const underIt = b.refs.under === gh && (b.state.status === undefined || s4IsAccept(b, pool));
    const passed = b.type === 'grant' && b.refs.parent === gh && b.state.status === undefined;
    return b.type !== undefined && (underIt || passed) && binds(b, pool) && (passed || !filter || s4Core(b, g, pool) === null);
  });
  const recs = L.own ? [] : s4MeterReceipts(L, pool), waiting = [], placed = [];
  for (const b of blocks) {
    if (L.own) { if (!s4OnLine(L, b, pool)) placed.push({ place: Infinity, b, fixed: 'not_on_line' }); else placed.push({ place: Number.isInteger(b.state.seq) ? b.state.seq : 0, b, fixed: null }); continue; }
    const i = recs.findIndex(r => asList(r.refs.derives_from).includes(b.hash));
    if (i >= 0) placed.push({ place: i, b, fixed: null }); else { waiting.push({ block: b.hash, on: 'meter' }); placed.push({ place: Infinity, b, fixed: 'waiting' }); }
  }
  placed.sort((x, y) => (x.place === y.place ? cmp(x.b.hash, y.b.hash) : x.place < y.place ? -1 : 1));
  const out = [];
  for (const { place, b, fixed: f0 } of placed) {
    const takes = []; let fixed = f0;
    if (b.type === 'grant') { if (isAmount(scopeOf(b).limit)) takes.push([gh, scopeOf(b).limit]); }
    else if (s4IsAccept(b, pool) || (b.type === 'promise' && b.state.status === undefined)) {
      const C = s4IsAccept(b, pool) ? pool.get(b.refs.answers) : b;
      if (C) {
        const qv = isObj(b.state.terms) && b.state.terms.quantity !== undefined ? b.state.terms.quantity : isObj(C.state.terms) ? C.state.terms.quantity : undefined;
        const A = s4KeptBy(C, ons, pool);
        if (A && isAmount(qv)) takes.push([isStr(C.state.occurrence) && isObj(A.state.terms) && A.state.terms.repeat !== undefined ? A.hash + '@' + C.state.occurrence : A.hash, qv]);
        const sells = !!principal && ((A && A.refs.from === principal) || C.refs.from === principal);
        const onTerms = s4IsAccept(C, pool) ? pool.get(C.refs.answers) || C : C;
        const binds = s4Binds(onTerms, qv, sells, kind);
        if (limit || each) {
          const dr = b.state.draws, stated = isObj(dr) && dr.grant === gh && isAmount(dr.amount) ? dr.amount : null;
          if (stated && binds && sameKind(stated, kind) && sameKind(binds.kind, stated) && fcmp(binds.f, dec(stated.value)) <= 0) takes.push([gh, stated]); else fixed = fixed || 'unit';
        } else if ((binds === null || fpos(binds.f)) && !sells) fixed = fixed || 'past';
      }
    } else if (b.type === 'transfer') {
      const to = asList(b.refs.to_owner);
      if (!(to.length === 1 && to[0] === principal)) {
        const a = isAmount(b.state.amount) ? b.state.amount : null, part = asList(b.refs.what).filter(w => what.includes(w));
        if (part.length && a) takes.push([part[0], a]);
        else if (a) {
          const counted = s4DealsMade(g, pool).some(([x, ds]) => asList(b.refs.for).some(d => ds.includes(d)) && pool.sees(b.hash, x.hash));
          if (!counted) { if (limit || each) takes.push([gh, a]); else if (fpos(dec(a.value))) fixed = fixed || 'past'; }
        }
      }
    } else if (b.type === 'transform') {
      for (const i of asList(b.state.inputs)) {
        if (!isObj(i) || !isStr(i.from) || !isAmount(i.amount) || !what.includes(i.from)) continue;
        takes.push([i.from, i.amount]);
        if (limit && sameKind(limit, i.amount)) takes.push([gh, i.amount]);
      }
    }
    const mine = takes.find(([o]) => o === gh);
    if (each && mine && (!sameKind(mine[1], each) || fcmp(dec(mine[1].value), dec(each.value)) > 0)) fixed = fixed || 'past';
    if (fixed === 'waiting' && !takes.length) { fixed = null; const k = waiting.findIndex(x => x.block === b.hash); if (k >= 0) waiting.splice(k, 1); }
    out.push({ block: b.hash, takes, fixed, period: s4PeriodOf(g, L, b, pool) || 0, place });
  }
  return { draws: out, waiting };
}
// a pair on the holder's own line at or before a block: its blocks, sorted, or null
function s4PairAt(b, L, pool) {
  const past = pool.past(b.hash);
  for (const grp of s4PairGroups(pool)) {
    if (!grp.every(x => { const o = pool.get(x); return !!o && (s4OnLine(L, o, pool) || o.refs.author === L.author); })) continue;
    if (grp.some(x => x === b.hash || past.has(x))) return [...grp].sort();
  }
  return null;
}
// the groups of a pair: one key's blocks on one prev, or at one seq
function s4PairGroups(pool) {
  const pairs = forkPairs(pool), adj = new Map();
  for (const [x, y] of pairs) { for (const [a, c] of [[x, y], [y, x]]) { if (!adj.has(a)) adj.set(a, new Set()); adj.get(a).add(c); } }
  const seen = new Set(), out = [];
  for (const h of adj.keys()) { if (seen.has(h)) continue; const grp = [], st = [h]; while (st.length) { const z = st.pop(); if (seen.has(z)) continue; seen.add(z); grp.push(z); for (const y of adj.get(z)) st.push(y); } out.push(grp.sort()); }
  return out;
}
const s4ForkAnswer = (g, pool, held) => ({ pair: true, held, at_most: worstOp(g, pool.all()).at_most });
// the meter: { grant, fits, why, line, start, period, draws, left, waiting, ended, comes_back } for one block under the grant (or a grant passed on from it), or for the grant's own draws when `at` is null; { not_shown, lacks } where the line is not held
function s4MeterRead(g, pool, at) {
  const key = 'm4:' + g.hash + ':' + (at ? at.hash : '');
  pool._s4mr = pool._s4mr || new Map();
  if (pool._s4mr.has(key)) return pool._s4mr.get(key);
  pool._s4in = pool._s4in || new Set();
  const fresh = !pool._s4in.has(g.hash);
  pool._s4in.add(g.hash);
  let r;
  try { r = s4MeterNow(g, pool, at, fresh); } finally { if (fresh) pool._s4in.delete(g.hash); }
  if (fresh) pool._s4mr.set(key, r);
  return r;
}
function s4MeterNow(g, pool, at, filter) {
  const gh = g.hash, measures = s4Measures(g, pool);
  const ownWhy = s4OnRows(g, pool).some(r => r.why === 'past' && !r.takes) ? 'past' : null;
  const empty = (fits, why) => ({ grant: gh, fits, why, line: null, start: null, period: 0, draws: [], left: [], waiting: [], ended: null, comes_back: [] });
  const L = s4Line(g, pool);
  if (L === null) {
    if (!at) return empty(ownWhy === null, ownWhy);
    const bound = g.refs.what !== undefined || scopeOf(g).on !== undefined || scopeOf(g).limit !== undefined;
    return bound ? empty(false, 'not_on_line') : empty(true, null);
  }
  if (L.missing) return { not_shown: true, lacks: [L.name] };
  const { draws, waiting } = s4Draws(g, L, pool, filter);
  if (L.own && at) { const grp = s4PairAt(at, L, pool); if (grp) return { grant: gh, fits: false, why: s4ForkAnswer(g, pool, grp), line: 'own', start: L.name, period: 0, draws: [], left: [], waiting, ended: null, comes_back: [] }; }
  const stops = pool.all().filter(s => s.type === 'grant' && s.state.status === 'stopped' && s.refs.updates === gh && s.refs.author === g.refs.author && counts(s, pool)).sort((x, y) => cmp(x.hash, y.hash));
  const recs = L.own ? [] : s4MeterReceipts(L, pool);
  let ended = null, endedPlace = null;
  if (L.own) ended = stops.length ? stops[0].hash : null;
  else { const s = stops.find(s => recs.some(r => asList(r.refs.derives_from).includes(s.hash))); ended = s ? s.hash : null; if (ended) endedPlace = recs.findIndex(r => asList(r.refs.derives_from).includes(ended)); }
  const receiptOf = h => recs.find(r => asList(r.refs.derives_from).includes(h)) || null;
  const statedTotal = (r, of) => { const it = Array.isArray(r.state.drawn) ? r.state.drawn.find(i => isObj(i) && i.of === of) : null; return it && isAmount(it.total) ? it.total : null; };
  let meterFork = null;
  if (!L.own) {
    for (const grp of s4PairGroups(pool)) {
      if (!grp.every(x => { const o = pool.get(x); return !!o && s4OnLine(L, o, pool); })) continue;
      const places = grp.map(x => { const i = recs.findIndex(r => r.hash === x); if (i >= 0) return i; const j = recs.findIndex(r => pool.sees(r.hash, x)); return j >= 0 ? j : Infinity; });
      const p = Math.min(...places);
      if (p !== Infinity && (!meterFork || p < meterFork.place)) meterFork = { place: p, answer: s4ForkAnswer(g, pool, [...grp].sort()) };
    }
  }
  const cap = of => { const m = measures.find(x => x.of === of.split('@')[0]); return m ? m.amount : null; };
  const periodFor = (of, d) => (of === gh ? d.period : 0);
  const running = new Map(), frees = [], rows = [];
  const k2 = (of, p) => of + '#' + p;
  let answer = null;
  for (const d of draws) {
    let why = d.fixed;
    if (why === null && endedPlace !== null && d.place !== Infinity && d.place > endedPlace) why = 'past';
    if (why === null && meterFork && d.place !== Infinity && d.place >= meterFork.place) why = meterFork.answer;
    const past = pool.past(d.block);
    const givenBack = (of, p) => fsumF(frees.filter(f => f.of === of && f.period === p && past.has(f.by)).map(f => f.amount));
    const r = receiptOf(d.block);
    const whole = !r || (() => { const w = walkLine(pool, r.hash, L.name); return w.reached && w.lacks.length === 0; })();
    if (why === null) {
      for (const [of, a] of d.takes) {
        const p = periodFor(of, d), m = cap(of);
        if (!m) { why = 'no_measure'; break; }
        if (!sameKind(m, a)) { why = 'unit'; break; }
        const t = r && !whole ? statedTotal(r, of) : null;
        const over = t ? (!sameKind(t, m) || fcmp(dec(t.value), dec(m.value)) > 0) : fcmp(fadd(fsub(running.get(k2(of, p)) || F0, givenBack(of, p)), dec(a.value)), dec(m.value)) > 0;
        if (over) { why = 'past'; break; }
      }
    }
    if (why === null) {
      for (const [of, a] of d.takes) { const k = k2(of, periodFor(of, d)); running.set(k, fadd(running.get(k) || F0, dec(a.value))); }
      const b = pool.get(d.block);
      for (const f of s4RestFreed(b, g, d.takes, pool)) frees.push({ ...f, period: periodFor(f.of, d) });
    }
    for (const [of, a] of d.takes) rows.push({ block: d.block, of, amount: a, takes: why === null, why });
    if (!d.takes.length) rows.push({ block: d.block, of: null, amount: null, takes: why === null, why });
    if (at && d.block === at.hash) answer = { fits: why === null, why, period: d.period };
  }
  const nowPeriod = answer ? answer.period : draws.reduce((m, d) => Math.max(m, d.period), 0);
  const seen = at ? pool.past(at.hash) : null;
  const leftOf = m => {
    if (!m.amount) return null;
    const per = m.of === gh ? nowPeriod : 0, mine = of => of === m.of || of.startsWith(m.of + '@');
    let used = F0; for (const [k, v] of running) { const i = k.lastIndexOf('#'); if (Number(k.slice(i + 1)) === per && mine(k.slice(0, i))) used = fadd(used, v); }
    const back = fsumF(frees.filter(f => f.period === per && mine(f.of) && (!seen || seen.has(f.by))).map(f => f.amount));
    return { f: fadd(fsub(dec(m.amount.value), used), back), kind: kindOf(m.amount) };
  };
  const left = measures.map(m => { const l = leftOf(m); return l ? { of: m.of, amount: amtOut(l.f, l.kind) } : null; }).filter(Boolean);
  const comesBack = ended === null ? [] : measures.map(m => { const l = leftOf(m); return l && fpos(l.f) ? { of: m.of, amount: amtOut(l.f, l.kind) } : null; }).filter(Boolean);
  let fits, why, period;
  if (!at) { fits = ownWhy === null; why = ownWhy; period = 0; }
  else if (answer) ({ fits, why, period } = answer);
  else { fits = true; why = null; period = 0; }
  return { grant: gh, fits, why: fits ? null : why, line: L.own ? 'own' : L.name, start: L.name, period, draws: rows, left, waiting, ended, comes_back: comesBack };
}
// the rest of a deal a draw under the grant bound, where it can no longer fall due (00-shared, Freed; 05-deals, The rest of a deal): the payee's signal that the price is paid; her stop of the grant, where the offer
// said ahead that a stop ends what has not come (`terms.stoppable`); a cutoff through the offer's `deliver_by` on `needed` lines of the clocks it names; a ruling of a judge both sides named that ends the rest (`state.ends_rest`).
// Each measure the draw took on gets back what of it the rest held: the quantity not come, or, in money, the total at that quantity. [{ of, amount (a fraction), by (the freeing block) }]
function s4RestFreed(b, g, takes, pool) {
  if (!b || !s4IsAccept(b, pool)) return [];
  const D = pool.get(b.refs.answers);
  if (!D) return [];
  const t = isObj(D.state.terms) ? D.state.terms : {}, payee = isStr(D.refs.from) ? D.refs.from : D.refs.author;
  const qv = isObj(b.state.terms) && b.state.terms.quantity !== undefined ? b.state.terms.quantity : t.quantity;
  const paid = () => { const x = pool.all().find(x => x.type === 'observe' && x.state.kind === 'paid' && asList(x.refs.subject).includes(D.hash) && counts(x, pool) && speakerOf(x, pool) === payee); return x ? x.hash : null; };
  const stopped = () => { if (t.stoppable !== true) return null; const s = pool.all().filter(s => s.type === 'grant' && s.state.status === 'stopped' && s.refs.updates === g.hash && s.refs.author === g.refs.author && counts(s, pool)).sort((x, y) => cmp(x.hash, y.hash))[0]; return s ? s.hash : null; };
  const delivered = () => {
    const ks = clocksOf(t.clocks);
    if (!isStr(t.deliver_by) || !ks) return null;
    const cuts = ks.names.map(n => cutoffsOn(n, pool).filter(c => c.state.when === t.deliver_by && asList(c.refs.subject).includes(D.hash)).sort((x, y) => cmp(x.hash, y.hash))[0]).filter(Boolean);
    return cuts.length && cuts.length >= ks.needed ? cuts[0].hash : null;
  };
  const ruled = () => {
    const sides = [payee, D.refs.to].filter(isStr), sideOf = x => { const s = speakerOf(x, pool); return sides.includes(s) ? s : null; };
    const judges = pool.all().filter(x => x.type === 'grant' && x.state.kind === 'referee' && x.state.status === undefined && x.refs.subject === D.hash && counts(x, pool) && sideOf(x) !== null
      && pool.all().some(a => a.type === 'grant' && a.state.status === 'accepted' && a.refs.answers === x.hash && counts(a, pool) && sideOf(a) !== null && sideOf(a) !== sideOf(x))).map(x => x.refs.to);
    const x = pool.all().find(x => x.type === 'observe' && x.state.kind === 'ruling' && x.refs.subject === D.hash && x.state.ends_rest === true && counts(x, pool) && judges.includes(x.refs.author));
    return x ? x.hash : null;
  };
  const by = paid() || stopped() || delivered() || ruled();
  if (!by || !isAmount(qv)) return [];
  const came = fsumF(pool.all().filter(x => x.type === 'transfer' && x.state.status === undefined && asList(x.refs.for).includes(D.hash) && counts(x, pool) && isAmount(x.state.amount) && sameKind(x.state.amount, qv)).map(x => dec(x.state.amount.value)));
  const rest = fsub(dec(qv.value), came);
  if (!fpos(rest)) return [];
  const restQ = amtOut(rest, kindOf(qv)), money = termsTotalF(t, restQ);
  return takes.map(([of, a]) => {
    let back = sameKind(a, qv) ? rest : money && sameKind(money.kind, a) ? money.f : null;
    if (back === null) return null;
    back = fmin(back, dec(a.value));
    return { of, amount: back, by };
  }).filter(Boolean);
}

// ---- G15: her deadline, and the lowest offer at it. Read on the line refs.meter names.
// where a block stands against a stated time `t` on a line (00-shared, Cutoff): 'before' (a receipt of it, or the block itself on the line, with no cutoff of `t` for `subject` before it), 'after' (such a cutoff and no such receipt), null (not shown yet)
function s4BeforeTime(L, h, t, subject, pool) {
  const cuts = cutoffsOn(L.name, pool).filter(c => c.state.when === t && asList(c.refs.subject).includes(subject));
  const cut = cuts.find(c => !cuts.some(o => o !== c && placedBefore(pool, o, c))) || null;
  const rx = receiptsOn(L.name, h, pool).slice(), b = pool.get(h);
  if (b && s4OnLine(L, b, pool)) rx.push(b);
  if (rx.some(r => !cut || placedBefore(pool, r, cut))) return 'before';
  return cut ? 'after' : null;
}
function s4Lowest(g, pool) {
  const sc = scopeOf(g), none = why => ({ offer: null, received: null, cutoff: null, why });
  if (!isStr(sc.deadline)) return none('pending');
  const L = s4Line(g, pool);
  if (!L || L.missing) return none('pending');
  const cuts = cutoffsOn(L.name, pool).filter(c => c.state.when === sc.deadline && asList(c.refs.subject).includes(g.hash));
  const cut = cuts.find(c => !cuts.some(o => o !== c && placedBefore(pool, o, c)));
  if (!cut) return none('pending');
  const ons = asList(sc.on).map(h => pool.get(h)).filter(A => A && A.type === 'promise'), parties = asList(sc.parties), lim = limitOf(g);
  const recs = s4MeterReceipts(L, pool);
  let best = null;
  recs.forEach((r, i) => {
    if (!pool.sees(cut.hash, r.hash)) return;
    for (const h of asList(r.refs.derives_from)) {
      const o = pool.get(h);
      if (!o || o.type !== 'promise' || o.state.status !== undefined) continue;
      const A = ons.find(a => keepsTo(o, a, pool, {}).keeps);
      if (!A) continue;
      const principal = A.refs.author, sidesA = ['from', 'to'].flatMap(k => asList(A.refs[k]));
      if (!['from', 'to'].flatMap(k => asList(o.refs[k])).every(s => s === principal || parties.includes(s) || sidesA.includes(s))) continue;
      // standing there: no cutoff through its own `expires` before the deadline's on that line, and no stop of it in the cutoff's past
      const exp = isObj(o.state.terms) && isStr(o.state.terms.expires) ? o.state.terms.expires : null;
      if (exp !== null && cutoffsOn(L.name, pool).some(c => c.state.when === exp && asList(c.refs.subject).includes(o.hash) && (c === cut || pool.sees(cut.hash, c.hash)))) continue;
      if (pool.all().some(s => s.state.status === 'stopped' && s.refs.updates === o.hash && pool.sees(cut.hash, s.hash))) continue;
      const aq = isObj(A.state.terms) ? A.state.terms.quantity : undefined;
      const tot = termsTotalF(o.state.terms, isAmount(aq) ? aq : undefined);
      if (!tot || (lim && !sameKind(tot.kind, lim))) continue;
      if (!best || fcmp(tot.f, best.f) < 0 || (fcmp(tot.f, best.f) === 0 && i < best.i)) best = { f: tot.f, i, offer: o.hash, received: r.hash };
    }
  });
  return best ? { offer: best.offer, received: best.received, cutoff: cut.hash, why: null } : { offer: null, received: null, cutoff: cut.hash, why: 'none' };
}
// ---- the stop of a grant (G16): a stop is seen by a block that has it in its causal past, or, where the grant names clocks, where the lines that show the stop before the block are `names` less `needed`, plus one
function s4LineSays(name, b, E, pool) {
  const rb = receiptsOn(name, b.hash, pool), re = E ? receiptsOn(name, E.hash, pool) : [];
  for (const r of rb) {
    if (re.includes(r)) continue;
    if (re.some(e => placedBefore(pool, e, r))) return 'after';
    if (re.every(e => placedBefore(pool, r, e))) return 'passes';
  }
  return !rb.length && re.length ? 'after' : null;
}
function grantSeenBy(g, pool, relying) {
  const base = pool.seenBy(relying), ks = isObj(g.state.scope) ? clocksOf(g.state.scope.clocks) : null;
  if (!relying || !ks) return base;
  return h => {
    if (base(h)) return true;
    const E = pool.get(h);
    return !!E && ks.names.filter(n => s4LineSays(n, relying, E, pool) === 'after').length >= ks.names.length - ks.needed + 1;
  };
}
// ---- G1: a tool's word. Everything but the limit (the clauses a block must pass to be counted at all); null when it passes, else { code, detail }
function s4Core(b, g, pool) {
  const fail = (code, detail, extra) => ({ code, detail, ...extra });
  const sc = scopeOf(g), k = s4Kind(b);
  if (!receives(g, b, pool)) return fail('not_live', 'the signer is not the receiver of the grant');
  if (!grantLive(g, pool, new Set(), b)) return fail('not_live', 'the grant is not live');
  for (const x of grantChain(g, pool)) { // a grant passed on stands only where it fits its parent's line (G9)
    const up = x.refs.parent === undefined ? null : pool.get(x.refs.parent);
    if (up && up.type === 'grant' && (limitOf(up) || eachOf(up))) { const m = s4MeterRead(up, pool, x); if (m.fits === false && !m.not_shown) return fail('not_live', 'the grant was passed on past its parent\'s line'); }
  }
  // Coming back: a hand-back (the holder's own transfer to_owner her, of what the grant's line holds) needs no type in `types`, no room under `limit` and no accept
  if (k === 'pay' && b.refs.to_owner === principalOfChain(g, pool) && asList(b.refs.what).length && asList(b.refs.what).every(h => grantChain(g, pool).some(x => asList(x.refs.what).includes(h)))) return null;
  if (b.state.handle !== undefined && g.state.handle !== b.state.handle) return fail('not_live', 'the grant does not name the handle');
  const names = typeNames(b);
  if (sc.types === undefined || !names.some(n => asList(sc.types).includes(n))) return fail('not_live', 'the block\'s type is outside the grant\'s scope');
  const principal = principalOfChain(g, pool), parties = asList(sc.parties);
  const ans = isStr(b.refs.answers) ? pool.get(b.refs.answers) : null;
  const sides = ['from', 'to', 'to_owner', 'to_holder'].flatMap(x => asList(b.refs[x]));
  if (ans) { const named = ['from', 'to'].flatMap(x => asList(ans.refs[x])); sides.push(...(named.length ? named : asList(ans.refs.author))); }
  const passing = k === 'pay' && s4IsPass(b, g, pool);
  // stage 5 compare (G1, "each side is admitted (`parties`, `on`)"): a side is admitted where `parties` lists it, where a promise of hers in `on` names it (her own word
  // named him), or where it is a side of a deal a block under the grant made; a side an `on` promise leaves open admits anyone where the grant states no `parties`
  const ons = asList(sc.on).map(h => pool.get(h)).filter(p => p && p.type === 'promise');
  const onSides = ons.flatMap(p => ['from', 'to'].flatMap(x => asList(p.refs[x])));
  const openSide = sc.parties === undefined && ons.some(p => p.refs.from === undefined || p.refs.to === undefined);
  const madeSides = pool.all().filter(a => a.hash !== b.hash && a.refs.under === g.hash && a.type === 'promise' && a.state.status === 'accepted' && isStr(a.refs.answers)).flatMap(a => { const o = pool.get(a.refs.answers); return o ? [...['from', 'to'].flatMap(x => asList(o.refs[x])), o.refs.author] : []; });
  const admitted = id => id === principal || openSide || parties.includes(id) || onSides.includes(id) || madeSides.includes(id);
  if (!passing && sides.some(id => !admitted(id))) return fail('not_live', 'a side the block deals with is outside the grant\'s parties');
  if (k === 'other') return fail('not_kept', 'a block of this kind speaks for its signer alone');
  // a make names what it draws on in `state.inputs: [{ from, amount }]` (00-shared, Draws; stage 7 compare, settled): under a grant, every input is a thing the grant names in `refs.what`
  if (k === 'make') { const what = asList(g.refs.what), froms = (Array.isArray(b.state.inputs) ? b.state.inputs : []).filter(i => isObj(i) && isStr(i.from)).map(i => i.from); if (!what.length || !froms.length || !froms.every(f => what.includes(f))) return fail('not_kept', 'a make under a grant that does not name what it is made from'); }
  const held = s4Held(g, pool);
  let C = null, deal = null;
  if (k === 'promise' || k === 'accept') {
    C = s4PromiseOf(b, pool);
    if (!C) return fail('not_kept', 'the promise it binds her to is not held');
    let best = null;
    for (const h of held) { const A = pool.get(h); if (!A) continue; const r = keepsTo(C, A, pool, { principal, parties }); if (r.keeps) { best = { A, keeps: true }; break; } if (!best || (!best.keeps && r.why < best.why)) best = { A, keeps: false, why: r.why }; }
    if (!best) return fail('not_kept', 'no promise of scope.on is held', { why: null });
    if (!best.keeps) return fail('not_kept', best.why, { why: best.why });
    // G4: one fill for each occurrence
    const aT = isObj(best.A.state.terms) ? best.A.state.terms : {};
    if (k === 'accept' && aT.repeat !== undefined && isStr(C.state.occurrence)) {
      const filled = pool.all().some(x => x.hash !== b.hash && x.type === 'promise' && x.state.status === 'accepted' && counts(x, pool) && (() => {
        const Cx = s4PromiseOf(x, pool);
        if (!Cx || Cx.state.occurrence !== C.state.occurrence || !keepsTo(Cx, best.A, pool, { principal, parties }).keeps) return false;
        if (pool.sees(b.hash, x.hash) || !pool.sees(x.hash, b.hash)) { return speakerOf(x, pool) === principal; } // before it, or neither first
        return false;
      })());
      if (filled) return fail('not_kept', 'the occurrence is already filled');
    }
    deal = s4Root(C, pool);
  } else if (k === 'make') { // a make under a grant that names an instance: the draw is counted on that part's line (Toll work)
  } else if (k === 'pay' && s4IsPass(b, g, pool)) { // G13: a block of a tool of hers that gives a part its line holds to another tool of hers passes that part; it gives nothing away
    return null;
  } else { // a payment, a delivery, or a word about what is hers to receive: of a deal in scope.on, or one a block under the same grant made
    deal = s4DealOf(b, pool);
    const made = deal && (held.includes(deal.hash) || pool.all().some(x => x.refs.under === g.hash && ['promise', 'accept'].includes(s4Kind(x)) && s4DealKey(x, pool) === deal.hash));
    if (!made) return fail('not_kept', 'a deal not in scope.on and not made under this grant');
    if (k === 'pay') { const due = s4Due(b, deal, principal, pool); if (due) return fail('not_due', due); }
  }
  // S1: her stop of one thing ends, for that thing only, every draw under her grants until she lifts it
  {
    const things = new Set([...asList(b.refs.what), ...(C ? asList(C.refs.what) : []), ...asList(b.refs.derives_from)]);
    const handBack = k === 'pay' && b.refs.to_owner === principal;
    if (things.size && !handBack) {
      const seenBy = grantSeenBy(g, pool, b);
      for (const S of pool.all()) {
        if (S.type !== 'observe' || S.state.status !== 'stopped' || S.state.stop !== 'onward' || S.refs.updates !== undefined || S.refs.answers !== undefined || S.refs.author !== principal || !counts(S, pool)) continue;
        const T0 = asList(S.refs.what)[0];
        if (!things.has(T0) || !seenBy(S.hash)) continue;
        const lifted = pool.all().some(x => x.type === 'observe' && x.state.status === 'resumed' && x.refs.updates === S.hash && x.refs.author === principal && counts(x, pool) && pool.sees(b.hash, x.hash) && standsOf(x, pool).stands);
        if (lifted) continue;
        if (isAmount(S.state.amount)) { // with `amount`, it reaches only a block after which the grant's line would hold less than that much of the thing undrawn
          const th = pool.get(T0), pack = th && isAmount(th.state.pack) ? th.state.pack : null;
          const part = limitOf(g) && pack && sameKind(limitOf(g), pack) ? limitOf(g) : pack;
          const amt = x => (isAmount(x.state.amount) ? x.state.amount : (Array.isArray(x.state.inputs) ? (x.state.inputs.find(i => isObj(i) && i.from === T0) || {}).amount : null));
          const drawn = pool.all().filter(x => x.refs.under === g.hash && (x === b || pool.sees(b.hash, x.hash)) && asList(x.refs.what).concat(asList(x.refs.derives_from)).includes(T0) && isAmount(amt(x))).map(x => dec(amt(x).value));
          if (part && fcmp(fsub(dec(part.value), fsumF(drawn)), dec(S.state.amount.value)) >= 0) continue;
        }
        return fail('stopped_thing', 'her stop of one thing reaches this block');
      }
    }
  }
  // no one is both sides of a word (A9): a block that gives to its own signer, to a key linked to the signer, or to a circle she belongs to speaks for no one else, unless a promise in scope.on names that side
  {
    const signer = b.refs.author, named = new Set(held.flatMap(h => { const A = pool.get(h); return A ? ['from', 'to'].flatMap(x => asList(A.refs[x])) : []; }));
    const gives = [...sides].filter(x => x !== principal);
    const circleHas = x => handCouldCount(signer, x, pool, pool.before(b.hash));
    if (gives.some(x => !named.has(x) && (x === signer || s4Linked(signer, x, pool) || circleHas(x)))) return fail('both_sides', 'a block that gives to its own signer, or to a key linked to it, speaks for no one else');
  }
  // G15: the deadline, read by its place on the line refs.meter names (a cutoff through it, refs.subject the grant); a date orders nothing but the block's own, against its own signer
  if (k === 'accept' && isStr(sc.deadline)) {
    const L = s4Line(g, pool), v = L && !L.missing ? s4BeforeTime(L, b.hash, sc.deadline, g.hash, pool) : null;
    if (sc.fallback === 'lowest') {
      if (v === 'before') return fail('not_live', 'with a fallback, no accept under the grant counts before the deadline');
      if (v === null) return fail('waiting', 'the meter\'s line has not shown the accept before or after the deadline', { waiting: [{ block: b.hash, on: 'meter' }] });
      const lo = s4Lowest(g, pool), A = pool.get(b.refs.answers);
      if (!A || A.hash !== lo.offer) return fail('after_deadline', 'after the deadline only her tool\'s accept of the lowest offer counts');
    } else {
      const ownLate = isStr(b.state.at) ? Date.parse(b.state.at) >= Date.parse(sc.deadline) : v !== 'before'; // its own date shows it late against its own signer; with none, it is in time only where the line shows it before
      if (v === 'after' || ownLate) return fail('after_deadline', 'nothing under the grant accepts after its deadline');
    }
  }
  return null;
}
// G13: a transfer by the holder, of the part the grant's line holds (refs.what of the grant), to another tool of the same giver (a live grant of hers made to that key); it names no deal
function s4IsPass(b, g, pool) {
  const parts = grantChain(g, pool).flatMap(x => asList(x.refs.what));
  const what = asList(b.refs.what);
  if (!what.length || !what.every(h => parts.includes(h)) || !isStr(b.refs.to_owner) || b.refs.for !== undefined) return false;
  const principal = principalOfChain(g, pool);
  return pool.all().some(x => x.type === 'grant' && x.state.status === undefined && x.refs.parent === undefined && x.refs.author === principal && x.refs.to === b.refs.to_owner && x.hash !== g.hash);
}
// what a payment or a delivery is due on (00-shared, Due): the deal's binding accept standing in its causal past; the deal's condition, held; what `waits_on` names, standing. null when due, else why not
function s4Due(b, D, principal, pool) {
  const past = pool.past(b.hash), t = isObj(D.state.terms) ? D.state.terms : {};
  const delivery = asList(b.refs.what).length > 0;
  const accept = pool.all().some(x => past.has(x.hash) && x.type === 'promise' && x.state.status === 'accepted' && counts(x, pool) && s4DealKey(x, pool) === D.hash && standsOf(x, pool).stands);
  if (!accept) return 'the deal\'s binding accept is not in its past';
  if (t.condition !== undefined && conditionHolds(t.condition, pool.all().filter(x => past.has(x.hash))) !== true) return 'the deal\'s condition has not held';
  const goodsTo = D.refs.to, payee = D.refs.from;
  const wordsOf = who => pool.all().filter(x => past.has(x.hash) && counts(x, pool) && speakerOf(x, pool) === who);
  if (t.waits_on === 'goods' && !delivery) {
    const came = wordsOf(goodsTo).some(x => (x.type === 'transfer' && x.state.status === 'accepted' && asList(x.refs.answers).some(h => { const tr = pool.get(h); return !!tr && tr.type === 'transfer' && asList(tr.refs.for).includes(D.hash); })) || (x.type === 'observe' && x.state.kind === 'received' && asList(x.refs.for).concat(asList(x.refs.subject)).includes(D.hash)));
    if (!came) return 'the price waits on the receiver\'s word that the goods came';
  }
  if (t.waits_on === 'price' && delivery) {
    const paid = wordsOf(payee).some(x => x.type === 'observe' && x.state.kind === 'paid' && asList(x.refs.subject).concat(asList(x.refs.for)).includes(D.hash));
    if (!paid) return 'what moves waits on the payee\'s signal that the price is paid';
  }
  // of what the deal names her side to hand over, no more
  if (delivery) { if (principal !== D.refs.from) return 'a delivery is by the side that gives the goods'; }
  else {
    if (principal !== D.refs.to && D.refs.to !== undefined) return 'a payment is by the side that pays';
    const quantity = (() => { for (const x of pool.all()) if (past.has(x.hash) && x.type === 'promise' && x.state.status === 'accepted' && s4DealKey(x, pool) === D.hash && isObj(x.state.terms) && x.state.terms.quantity !== undefined) return x.state.terms.quantity; return undefined; })();
    const tot = termsTotalF(t, isAmount(quantity) ? quantity : undefined);
    if (!tot || !isAmount(b.state.amount) || !sameKind(b.state.amount, tot.kind) || fcmp(dec(b.state.amount.value), tot.f) > 0) return 'a payment is of what the deal names, no more';
    if (b.refs.to_owner !== undefined && b.refs.to_owner !== payee) return 'a payment goes to the other side';
  }
  return null;
}
function whyNotUnder(b, poolIn) {
  const pool = poolOf(poolIn);
  const fail = (code, detail, extra) => [{ code, detail, ...extra }];
  const mine = pool.get(b.hash) === b, key = 'wnu:' + b.hash;
  if (mine && pool.memo.has(key)) return pool.memo.get(key);
  const t0 = pool._taint || 0;
  const r = whyNotUnderNow(b, pool, fail);
  if (mine && (pool._taint || 0) === t0) pool.memo.set(key, r);
  return r;
}
function whyNotUnderNow(b, pool, fail) {
  const g = pool.get(b.refs.under);
  if (!g || g.type !== 'grant') return fail('not_live', 'the grant is not held');
  const c = s4Core(b, g, pool);
  if (c) return [c];
  // Coming back needs no room on the line
  const principal = principalOfChain(g, pool);
  if (!(b.type === 'transfer' && b.state.status === undefined && asList(b.refs.to_owner).length === 1 && b.refs.to_owner === principal && g.refs.what !== undefined)) {
    const m = s4MeterRead(g, pool, b);
    if (m.not_shown) return fail('not_shown', 'the grant\'s line is not read whole', { lacks: m.lacks });
    if (!m.fits) {
      if (isObj(m.why) && m.why.pair) return fail('pair', 'a pair on the grant\'s line', { pair: m.why });
      return fail(isStr(m.why) ? m.why : 'past', 'the block does not fit on the grant\'s line');
    }
  }
  const st = standsOf(b, pool);
  if (!st.stands) return fail('waiting', 'the block does not stand yet', { waiting: st.waiting });
  return [];
}

// ---- write checks of stage 4
// price and quantity of a promise or a line: a range or a list at each (set_places), else as before. A quantity range no longer needs a per-unit price.
function s4PriceQuantity(price, quantity) {
  const out = [];
  if (isRL(price)) { const q = rangeListProblem(price); if (q) out.push(q); } else out.push(...priceProblems(price));
  if (isRL(quantity)) { const q = rangeListProblem(quantity); if (q) out.push(q); } else out.push(...quantityProblems(quantity, isRL(price) ? { per: {} } : price));
  return out;
}
// 1.9 (O2): a grant's own ending term `scope.ends_on` (protocol.json shapes.ends_on): both keys, `witness` an id (`grammar`), `said` text; anything else `shape`
function endsOnProblem(e) {
  const want = P.shapes.ends_on;
  if (!isObj(e) || Object.keys(e).length !== want.length || !want.every(k => k in e)) return 'shape';
  if (!isStr(e.said)) return 'shape';
  if (!(isStr(e.witness) && RX.id.test(e.witness))) return 'grammar';
  return null;
}
// her own ending term reached (O2): a counted observe of kind witness signed by the host `ends_on.witness` names, saying exactly `ends_on.said`, `for` the grant (and with the
// grant's own `state.handle`, where it states one), seen (as her own stop is: for a block that has it in its causal past)
function endsOnReached(g, pool, seen) {
  const e = isObj(g.state.scope) ? g.state.scope.ends_on : undefined;
  if (endsOnProblem(e)) return false;
  return pool.all().some(w => w.type === 'observe' && w.state.kind === 'witness' && w.refs.author === e.witness && w.state.said === e.said && asList(w.refs.for).includes(g.hash) && (g.state.handle === undefined || jcs(w.state.handle) === jcs(g.state.handle)) && seen(w.hash) && counts(w, pool));
}
// G9, a child grant: never open and never to a role (`shape`); its scope no wider than its parent's on every field, else `wider_than_parent`
function childProblem(cs, cr, parent, held) {
  if (cr.to === undefined) return 'shape';
  const ps = parent.state, pr = parent.refs, c = isObj(cs.scope) ? cs.scope : {}, p = isObj(ps.scope) ? ps.scope : {};
  const same = (x, y) => (x === undefined || y === undefined ? x === y : jcs(x) === jcs(y));
  const subset = (x, y) => asList(x).every(v => asList(y).some(w => jcs(v) === jcs(w)));
  if (!subset(c.types, p.types === undefined ? [] : p.types) || !subset(c.parties, p.parties === undefined ? [] : p.parties) || !subset(c.on, p.on === undefined ? [] : p.on)) return 'wider_than_parent';
  if (c.limit !== undefined && (p.limit === undefined || !sameKind(c.limit, p.limit))) return 'wider_than_parent';
  if (c.every !== undefined && p.limit !== undefined) return 'wider_than_parent';
  if (p.each !== undefined && (c.each === undefined || !sameKind(c.each, p.each) || decCmp(c.each.value, p.each.value) > 0)) return 'wider_than_parent';
  if (c.each !== undefined && p.each === undefined) return 'wider_than_parent';
  if (p.until !== undefined && (c.until === undefined || c.until > p.until)) return 'wider_than_parent';
  for (const f of ['clocks', 'deadline', 'fallback']) if (!same(c[f], p[f])) return 'wider_than_parent';
  if (cr.what !== undefined && !same(cr.what, pr.what)) return 'wider_than_parent';
  if (pr.meter !== undefined && cr.meter !== pr.meter) { // the parent's, where it is not the parent holder's own line
    const m = held && held.get ? held.get(pr.meter) : undefined;
    const own = !!m && ((m.type === 'actor' && m.refs.author === undefined && m.hash === pr.to) || m.refs.author === pr.to || m.refs.subject === pr.to);
    if (!own) return 'wider_than_parent';
  }
  if (pr.meter === undefined && cr.meter !== undefined) return 'wider_than_parent';
  if (ps.handle !== undefined && cs.handle !== ps.handle) return 'wider_than_parent';
  const pd = ps.depth === undefined ? 0 : ps.depth, cd = cs.depth === undefined ? 0 : cs.depth;
  return pd >= 1 && cd <= pd - 1 ? null : 'wider_than_parent';
}

// ================================================================ circles (1.9 stage 6; changes-1.9/06-circles.md; folds.md)
// A circle is people who own things together, and the rows by which some of them act for the owners. It never signs and holds no key: a block `as` it is a person's own word, and
// speaks for the owners only where one row holds for it (its hands counted in one place) or where every owner signs it together. Parts are title (C1). Nothing here fills a silence.
const isCircleBlock = b => !!b && b.type === 'actor' && b.state.kind === 'circle';
const isFoundingCircle = b => isCircleBlock(b) && b.refs.updates === undefined && b.refs.as === undefined;
// pack: whole parts (an amount of unit `part`, a whole number of at least 1, no `of`), C1
const packOf = C => (C && isObj(C.state.pack) && isAmount(C.state.pack) && C.state.pack.unit === 'part' && !('of' in C.state.pack) && /^[1-9][0-9]*$/.test(C.state.pack.value) ? C.state.pack : null);
const wholeN = n => Number.isInteger(n) && n >= 1;
// C10: a row is exactly { parts, scope } or { to, needed, scope }; every number whole and at least 1 (never `all`, never a share); `to` ids or one grant id; scope an object read as a grant's
function rowShapeOk(row, hasPack) {
  if (!isObj(row) || !isObj(row.scope)) return false;
  const ks = Object.keys(row).sort().join(',');
  if (ks === 'parts,scope') return hasPack && wholeN(row.parts) && scopeShapeOk(row.scope);
  if (ks === 'needed,scope,to') return wholeN(row.needed) && ((Array.isArray(row.to) && row.to.length > 0 && row.to.every(x => isStr(x) && RX.id.test(x))) || (isStr(row.to) && RX.id.test(row.to))) && scopeShapeOk(row.scope);
  return false;
}
function scopeShapeOk(sc) {
  if (Object.keys(sc).some(k => !P.scope.includes(k) && k !== 'what')) return false;
  for (const k of ['limit', 'each']) if (sc[k] !== undefined && (amountProblem(sc[k]) || decCmp(sc[k].value, '0') < 0)) return false;
  if (sc.types !== undefined && !(Array.isArray(sc.types) && sc.types.every(isStr))) return false;
  if (sc.what !== undefined && !asList(sc.what).every(x => isStr(x) && RX.id.test(x))) return false;
  return true;
}
const rowsOf = S => (Array.isArray(S && S.rules) ? S.rules : []);
const rowNamesActor = R => isObj(R) && isObj(R.scope) && asList(R.scope.types).some(t => t === 'actor' || (isStr(t) && t.startsWith('actor.')));
// the versions of a circle held (C19): actors of kind circle signed `as` it that update the founding block or an earlier version, sorted by hash
function circleVersionsOf(F, pool) {
  const cand = pool.all().filter(b => isCircleBlock(b) && b.refs.as === F && isStr(b.refs.updates) && counts(b, pool));
  const known = new Set([F]), out = [];
  for (let grew = true; grew;) { grew = false; for (const b of cand) if (!known.has(b.hash) && known.has(b.refs.updates)) { known.add(b.hash); out.push(b); grew = true; } }
  return out.sort(byHash);
}
// the block whose rows, clocks and meter stand for a causal past (C19; D15): of the versions that hold in it (all held with no past), the one every other is in the past of;
// where two are rivals, the latest block (a version or the founding block) both have in their past; with none, the founding block. `pack` is the founding block's only.
function circleNow(F, pool, past) {
  const C = pool.get(F);
  if (!isFoundingCircle(C)) return null;
  const vs = circleVersionsOf(F, pool).filter(v => (!past || past.has(v.hash)) && circleHolds(v, pool).holds);
  const isBefore = (a, b) => pool.sees(b, a); // a in b's past
  let stand = C;
  if (vs.length) {
    const heads = vs.filter(x => !vs.some(y => y !== x && isBefore(x.hash, y.hash)));
    if (heads.length === 1) stand = heads[0];
    else {
      const commons = [C, ...vs].filter(c => heads.every(h => isBefore(c.hash, h.hash)));
      const best = commons.filter(c => !commons.some(d => d !== c && isBefore(c.hash, d.hash)));
      stand = best.length === 1 ? best[0] : C;
    }
  }
  const S = stand.state;
  return { C, version: stand === C ? null : stand.hash, stand, state: S, rows: rowsOf(S), clocks: isObj(S.clocks) ? S.clocks : null, meter: isStr(stand.refs.meter) ? stand.refs.meter : null, pack: packOf(C) };
}
// the rows that stand for a block `as` the circle (C19): for an actor `as` it, only the founding block's rows that name `actor`; for any other block, the standing block's rows
// (read in the block's own causal past), rows naming `actor` read only from the founding block
function rowsFor(F, b, pool) {
  const C = pool.get(F);
  if (!isFoundingCircle(C)) return [];
  const all = rowsOf(C.state).map((R, i) => ({ R, i }));
  if (b.type === 'actor') return all.filter(x => rowNamesActor(x.R));
  const cn = circleNow(F, pool, pool.past(b.hash));
  return rowsOf(cn.state).map((R, i) => ({ R, i })).filter(x => cn.version === null || !rowNamesActor(x.R));
}
// the parts of a circle read in a causal past (the ownership fold of the circle itself, C1/C2): { none } with no pack, { not_shown, lacks }, or { map: id -> free parts,
// title: id -> parts owned (held draws included), unissued (the circle's own free parts), unissuedTitle }. A draw of hers that the move (or a move it confirms) answers is added
// back to her free parts (D1: the parts are hers until the receiver's yes).
function circleParts(F, pool, past, addBack) {
  if (past && typeof past === 'object') {
    pool._cpm = pool._cpm || new WeakMap();
    let m = pool._cpm.get(past); if (!m) { m = new Map(); pool._cpm.set(past, m); }
    const k = F + '|' + (addBack && addBack.size ? [...addBack].sort().join(',') : '');
    if (m.has(k)) return m.get(k);
    const t0 = pool._taint || 0;
    const out = circlePartsNow(F, pool, past, addBack);
    if ((pool._taint || 0) === t0) m.set(k, out);
    return out;
  }
  return circlePartsNow(F, pool, past, addBack);
}
function circlePartsNow(F, pool, past, addBack) {
  const C = pool.get(F);
  if (!isFoundingCircle(C) || !packOf(C)) return { none: true };
  if (past && !past.has(F)) return { map: new Map(), title: new Map(), unissued: F0, unissuedTitle: F0, heldAll: new Map(), draws: [] };
  const r = ownershipFold(C, pool, past || undefined, '');
  if (r.not_shown) return { not_shown: true, lacks: r.lacks };
  const map = new Map(), title = new Map(), heldAll = new Map();
  const add = (m, k, v) => m.set(k, fadd(m.get(k) || F0, v));
  for (const o of r.owners) { const a = o.amount ? dec(o.amount.value) : F0; add(map, o.owner, a); add(title, o.owner, a); }
  for (const d of r.draws) if (d.takes && d.state === 'held' && isStr(d.by) && d.amount) {
    const a = dec(d.amount.value);
    add(title, d.by, a); if (d.by !== F) add(heldAll, d.by, a);
    if (addBack && addBack.has(d.block) && d.by !== F) add(map, d.by, a);
  }
  const unissued = map.get(F) || F0, unissuedTitle = title.get(F) || F0;
  map.delete(F); title.delete(F);
  return { map, title, unissued, unissuedTitle, heldAll, draws: r.draws };
}
const partsOf = (cp, id) => (cp.map && cp.map.get(id)) || F0;
const titleOf = (cp, id) => (cp.title && cp.title.get(id)) || F0;
// D6: the ids a move gives to: a transfer's to_owner and to_holder; a grant's refs.to; an offer's or order's (a promise with no status that answers nothing) sides from and to;
// an accept of a promise: that promise's from, to and author; an accept of a transfer gives nothing; never the circle itself
function givesToIds(m, F, pool) {
  const ids = [], st = m.state.status;
  if (m.type === 'transfer' && st === undefined) for (const k of ['to_owner', 'to_holder']) ids.push(...asList(m.refs[k]));
  else if (m.type === 'grant' && st === undefined) ids.push(...asList(m.refs.to));
  else if (m.type === 'promise' && st === undefined && m.refs.answers === undefined) for (const k of ['from', 'to']) ids.push(...asList(m.refs[k]));
  else if (st === 'accepted') { const p = pool.get(asList(m.refs.answers)[0]); if (p && p.type === 'promise') for (const k of ['from', 'to', 'author']) ids.push(...asList(p.refs[k])); }
  return [...new Set(ids.filter(x => isStr(x) && x !== F))].sort();
}
// whether `who`'s hand could count in a circle, read in a causal past (all held with none): she owns parts of it by title, or a row's `to` names her (or a grant it names does)
function handCouldCount(who, X, pool, past) {
  if (!isFoundingCircle(pool.get(X))) return false;
  const cp = circleParts(X, pool, past || null);
  if (cp.title && fpos(titleOf(cp, who))) return true;
  const cn = circleNow(X, pool, past || null);
  const seen = past ? (h => past.has(h)) : (() => true);
  return cn.rows.some(R => isObj(R) && R.to !== undefined && rowNamed(R.to, X, pool, seen).includes(who));
}
// D6: an id is hers for a move: herself, a key linked to hers, a tool of hers (the holder of a counted grant she signed in her own name, in the move's causal past), or a
// circle in which her hand could count
function isHersFor(r, who, m, pool) {
  if (r === who) return true;
  if (s4Linked(who, r, pool)) return true;
  const past = pool.past(m.hash);
  if (pool.all().some(g => g.type === 'grant' && g.state.status === undefined && g.refs.author === who && g.refs.as === undefined && asList(g.refs.to).includes(r) && past.has(g.hash) && counts(g, pool))) return true;
  return handCouldCount(who, r, pool, past);
}
function movesGivesTo(m, who, F, pool) {
  pool._mgt = pool._mgt || new Map();
  const k = m.hash + '|' + who + '|' + F;
  if (pool.get(m.hash) === m && pool._mgt.has(k)) return pool._mgt.get(k);
  const out = givesToIds(m, F, pool).some(r => isHersFor(r, who, m, pool));
  if (pool.get(m.hash) === m) pool._mgt.set(k, out);
  return out;
}
// the ids a row's `to` names, as they stand for `seen` (C11, D16): each id, or for an id that is a grant `as` the circle that holds, the holders it names as it stands
function rowNamed(to, F, pool, seen) {
  const out = [];
  for (const id of asList(to)) { const g = pool.get(id); if (g && g.type === 'grant' && g.refs.as === F) out.push(...grantHolders(g, F, pool, seen)); else out.push(id); }
  return [...new Set(out.filter(isStr))].sort();
}
// D16: the holders of a head-count grant as it stands: its newest newer word `as` the circle that holds (a chain of words, each updating one before it); none where a holding
// stop of it is seen; where two newer words do not see each other, only the ids both name; less each holder who ended her own place
function grantHolders(g, F, pool, seen) {
  if (!seen(g.hash) || !rowHoldsMemo(g, F, pool).holds) return [];
  const words = [g];
  const cand = pool.all().filter(u => u.type === 'grant' && u.refs.as === F && isStr(u.refs.updates) && seen(u.hash) && counts(u, pool));
  for (let grew = true; grew;) { grew = false; for (const u of cand) if (!words.includes(u) && words.some(w => w.hash === u.refs.updates) && rowHoldsMemo(u, F, pool).holds) { words.push(u); grew = true; } }
  if (words.some(w => w.state.status === 'stopped')) return [];
  const newer = words.filter(w => w.state.status === undefined);
  const heads = newer.filter(w => !newer.some(y => y !== w && pool.sees(y.hash, w.hash)));
  let ids;
  if (heads.length <= 1) ids = asList((heads[0] || g).refs.to);
  else { const sets = heads.map(w => asList(w.refs.to)); ids = sets[0].filter(x => sets.every(s => s.includes(x))); }
  const ownEnd = x => pool.all().some(u => u.refs.author === x && seen(u.hash) && counts(u, pool) && u.refs.as === undefined && words.some(w => (u.refs.updates === w.hash && u.type === 'grant' && ['stopped', 'declined'].includes(u.state.status)) || (u.refs.answers === w.hash && (u.state.status === 'declined' || u.state.status === 'stopped'))));
  return ids.filter(x => isStr(x) && !ownEnd(x));
}
// D10: the amount a block binds: a transfer's state.amount; an offer's or order's total; an accept's total of the promise it accepts; no other block has one
function blockMoney(b, pool) {
  const st = b.state.status;
  if (b.type === 'transfer' && st === undefined) return isAmount(b.state.amount) ? b.state.amount : null;
  let on = null;
  if (b.type === 'promise' && st === undefined && b.refs.answers === undefined) on = b;
  else if (st === 'accepted' && pool) { const p = pool.get(asList(b.refs.answers)[0]); if (p && p.type === 'promise') on = p; }
  if (!on || !isObj(on.state.terms)) return null;
  const q = isObj(b.state.terms) && b.state.terms.quantity !== undefined ? b.state.terms.quantity : on.state.terms.quantity;
  return termsTotal(on.state.terms, q);
}
// 1.9 stage 7 (owner decision 1): a row's money cap reads a sale's draw as its money total, as stage 4 reads a grant's (a draw is the deal's total in the cap's kind). A transfer of goods that is `for` a deal with a price
// is that deal's total at the quantity it moves; a transfer of goods with no priced deal has no money total here, so its amount (another kind) stands above the cap (a bound bounds every kind; nothing fills the silence of a price).
function rowMoney(b, cap, pool) {
  const a = blockMoney(b, pool);
  if (!a || !cap || sameKind(a, cap)) return a;
  if (b.type === 'transfer' && b.state.status === undefined) {
    for (const d of asList(b.refs.for)) {
      const deal = pool.get(d);
      if (!deal || deal.type !== 'promise' || !isObj(deal.state.terms)) continue;
      const t = termsTotal(deal.state.terms, a);
      if (t && sameKind(t, cap)) return t;
    }
  }
  return a;
}
// counted once (C12, stage 4's rule, 05 R7c): a block `for` a deal the circle bound, where the binding block `as` the circle holds in its causal past, draws on nothing new
function countedWhenBound(b, F, pool) {
  const past = pool.past(b.hash);
  return asList(b.refs.for).some(d => pool.all().some(x => past.has(x.hash) && x.refs.as === F && x.type === 'promise' && (x.hash === d || asList(x.refs.for).includes(d) || asList(x.refs.answers).includes(d)) && (x.state.status === undefined || x.state.status === 'accepted') && rowHoldsMemo(x, F, pool).holds));
}
// D2/C13: a grant from a row is no wider than the row, judged only on what the row states: its types a subset; under the row's each, an each no higher, or no each and a limit no
// higher than it; under the row's limit, a limit no higher; refs.what inside the row's scope.what. Anything else the row leaves out bounds nothing.
function widerThanRow(g, rs) {
  const gs = isObj(g.state.scope) ? g.state.scope : {};
  const rt = asList(rs.types);
  if (rs.types !== undefined && asList(gs.types).some(t => !rt.includes(t))) return true;
  const within = (a, r) => isAmount(a) && sameKind(a, r) && fcmp(dec(a.value), dec(r.value)) <= 0;
  if (isAmount(rs.each) && !(within(gs.each, rs.each) || (gs.each === undefined && within(gs.limit, rs.each)))) return true;
  if (isAmount(rs.limit) && !within(gs.limit, rs.limit)) return true;
  if (rs.what !== undefined) { const ok = asList(rs.what); if (asList(g.refs.what).some(x => !ok.includes(x))) return true; }
  return false;
}
// D9: the period a block falls in under a row's `every`: the cutoffs on the circle's meter line whose refs.subject is the circle, a span no shorter than `every`, before the
// block's first receipt there; with no meter no period turns
function rowPeriod(R, b, F, meter, pool) {
  if (!isStr(R.scope.every) || !isStr(meter)) return 0;
  const line = clockLine(meter, pool);
  const cuts = line.filter(c => c.type === 'observe' && c.state.kind === 'cutoff' && asList(c.refs.subject).includes(F) && isStr(c.state.when) && parseDur(c.state.when) && s4Durs(c.state.when, R.scope.every) >= 0);
  const r = line.find(o => o.type === 'observe' && o.state.kind === 'receipt' && asList(o.refs.derives_from).includes(b.hash));
  return r ? cuts.filter(c => pool.sees(r.hash, c.hash)).length : 0;
}
// whether a row's scope covers a move, read as a grant's scope is, on the circle's line (C10, C12, C13, C4; D2, D9): only what the row states bounds
function rowCovers(Ri, m, F, pool, meter) {
  const R = Ri.R, sc = R.scope;
  if (sc.types !== undefined && !typeNames(m).some(t => asList(sc.types).includes(t))) return false;
  const what = asList(m.refs.what);
  if (sc.what !== undefined) { const ok = asList(sc.what); if (!what.every(w => ok.includes(w))) return false; }
  else if (what.includes(F)) return false; // the circle's own parts move only by a row that names the circle in `scope.what`, or by every owner (C4)
  if (sc.parties !== undefined) { const ok = asList(sc.parties); if (givesToIds(m, F, pool).some(x => !ok.includes(x))) return false; }
  if (sc.on !== undefined && (m.type === 'transfer' || m.refs.answers !== undefined)) { const on = asList(sc.on); // D4: a row's `on` covers a payment `for` (an answer answering) one of its promises
    if (![...asList(m.refs.for), ...asList(m.refs.answers)].some(x => on.includes(x))) return false; }
  if (m.type === 'grant' && m.state.status === undefined && m.state.kind !== 'key' && widerThanRow(m, sc)) return false; // D3: a grant wider than its row: no row holds for it, it waits
  if (isStr(sc.until) && timeMs(sc.until) !== null && (atMs(m) === null || timeMs(sc.until) <= atMs(m))) return false;
  const each = isObj(sc.each) ? sc.each : null, limit = isObj(sc.limit) ? sc.limit : null;
  if (each || limit) {
    const a = rowMoney(m, each || limit, pool);
    if (a && !countedWhenBound(m, F, pool)) {
      if (each && (!sameKind(a, each) || fcmp(dec(a.value), dec(each.value)) > 0)) return false;
      if (limit) {
        if (!sameKind(a, limit)) return false;
        const past = pool.past(m.hash), per = rowPeriod(R, m, F, meter, pool);
        let used = dec(a.value);
        for (const b of pool.all()) {
          if (!past.has(b.hash) || b.refs.as !== F || countedWhenBound(b, F, pool)) continue;
          const x = rowMoney(b, limit, pool);
          if (!x || !sameKind(x, limit)) continue;
          const r = rowHoldsMemo(b, F, pool);
          if (!r.holds || r.row !== Ri.i || jcs(rowsFor(F, b, pool).find(y => y.i === Ri.i)?.R ?? null) !== jcs(R)) continue;
          if (rowPeriod(R, b, F, meter, pool) !== per) continue;
          used = fadd(used, dec(x.value));
        }
        if (fcmp(used, dec(limit.value)) > 0) return false;
      }
    }
  }
  return true;
}
// C16's last clause: the row's (or grant's) scope.on names a promise the move is `for`, and that promise names her in `from` or `to`
function onNamesHer(R, who, m, pool) {
  const fors = asList(m.refs.for);
  return asList(R.scope.on).some(h => { if (!fors.includes(h)) return false; const A = pool.get(h); return !!A && A.type === 'promise' && ['from', 'to'].some(k => asList(A.refs[k]).includes(who)); });
}
// the unissued parts the circle's meter's receipts of the move state (C6, D8): counted receipts on the meter's line naming the move, `state.unissued` an amount in `part`; several
// must agree; null where there are none, they differ, or there is no meter
function unissuedStated(m, meter, pool) {
  if (!isStr(meter)) return null;
  const vals = receiptsOn(meter, m.hash, pool).filter(r => isAmount(r.state.unissued) && r.state.unissued.unit === 'part' && r.state.unissued.of === undefined).map(r => dec(r.state.unissued.value));
  if (!vals.length || vals.some(v => fcmp(v, vals[0]) !== 0)) return null;
  return vals[0];
}
// stands with `hands` left out: a hand stands as her word would (her key's wait, reach and bounds), never on the circle's rows
function standsNoHands(b, pool) {
  pool._snh = pool._snh || new Map();
  if (pool.get(b.hash) === b && pool._snh.has(b.hash)) return pool._snh.get(b.hash);
  const t0 = pool._taint || 0;
  const r = standsNow(b, pool, true);
  if (pool.get(b.hash) === b && (pool._taint || 0) === t0) pool._snh.set(b.hash, r);
  return r;
}
// whether a block has seen an end E (D7, D11): E is in its causal past (or is it), or the circle's clock received E before it received the block
function circleSaw(x, E, clock, pool) {
  if (E.hash === x.hash || pool.sees(x.hash, E.hash)) return true;
  if (!clock) return false;
  // a line received E before x: a receipt of E that every receipt of x has in its past (a line that has not received x says nothing of it)
  const before = n => { const rx = receiptsOn(n, x.hash, pool), re = receiptsOn(n, E.hash, pool); return rx.length > 0 && re.some(e => rx.every(r => r !== e && placedBefore(pool, e, r))); };
  return clock.names.filter(before).length >= clock.names.length - clock.needed + 1;
}
// her closes: the key grants with no voice that end her list, each counted and standing among the blocks held
const closesOf = (who, pool) => pool.all().filter(k => keyGrantOf(k, who) && Array.isArray(k.state.voices) && k.state.voices.length === 0 && counts(k, pool));
const closedIn = (person, pastSet, pool) => { try { const idf = identityFold(person, pool); return idf.keyMap.size > 0 && idf.standingAt(pastSet).voices.length === 0; } catch (e) { return false; } };
// C15 and C6, the core: rowHoldsRaw(move, circle, pool, { within }) -> { holds, row, every_owner, at, hands: [{ id, block, parts, counts, why }], waiting }
function rowHoldsRaw(m, F, pool, opts = {}) {
  pool._inCircle = (pool._inCircle || 0) + 1; // a cycle read while a row is being read taints what asked (06-circles.md); cycles elsewhere are as they were
  try { return rowHoldsRaw0(m, F, pool, opts); } finally { pool._inCircle--; }
}
function rowHoldsRaw0(m, F, pool, opts = {}) {
  const C = pool.get(F);
  const none = { holds: false, row: null, every_owner: false, at: null, hands: [], waiting: [{ block: m.hash, on: 'hands' }] };
  if (!isFoundingCircle(C) || m.refs.as !== F || !pool.past(m.hash).has(F)) return none;
  const inW = h => !opts.within || opts.within.has(h);
  const eq = equivocated(pool);
  // the hands: the move itself, and each block that names it in refs.confirms
  const handBlocks = [m, ...pool.all().filter(x => x.hash !== m.hash && asList(x.refs.confirms).includes(m.hash) && isStr(x.refs.author) && inW(x.hash))];
  const addBack = new Set(); for (const mm of [m, ...asList(m.refs.confirms).map(h => pool.get(h)).filter(Boolean)]) for (const a of asList(mm.refs.answers)) addBack.add(a);
  const cnM = circleNow(F, pool, pool.past(m.hash)), meter = cnM.meter;
  const clock = cnM.clocks ? clocksOf(cnM.clocks) : null;
  const hasPack = !!packOf(C);
  const hands = handBlocks.map(h => {
    let id = h.refs.author, fixed = null;
    if (h !== m && h.refs.as === F) id = F;
    else if (h !== m && h.refs.as !== undefined) id = h.refs.as;
    if (eq.has(h.hash)) fixed = 'pair';
    else if (!counts(h, pool)) fixed = 'not_voice';
    else if (id === F) fixed = 'not_voice';
    else if (h !== m && h.refs.as !== undefined && !rowHoldsMemo(h, h.refs.as, pool).holds) fixed = 'waiting';
    else if (!standsNoHands(h, pool).stands) fixed = 'waiting';
    let parts = null;
    if (hasPack) { const cp = circleParts(F, pool, pool.past(h.hash), addBack); if (!cp.not_shown && !cp.none) parts = id === F ? cp.unissued : partsOf(cp, id); }
    return { h, id, fixed, parts };
  });
  const rows = rowsFor(F, m, pool);
  const covering = rows.filter(Ri => isObj(Ri.R) && isObj(Ri.R.scope) && rowCovers(Ri, m, F, pool, meter));
  const gives = who => movesGivesTo(m, who, F, pool);
  // a hand's ends (D7) that x has seen: for a parts row, any draw of hers on the circle's parts signed after her hand (bar a draw the move takes up: D1), and her close
  const drawsOnF = pool.all().filter(t => t.type === 'transfer' && t.state.status === undefined && asList(t.refs.what).includes(F) && counts(t, pool));
  // her close: her list stands empty in x's causal past, or (on the circle's clock) a close of hers the clock received before x, where her list ends among the blocks held
  const closeSeen = (hd, x) => {
    if (isFoundingCircle(pool.get(hd.id))) return false;
    if (closedIn(hd.id, new Set([...pool.past(x.hash), x.hash]), pool)) return true;
    if (!clock) return false;
    const hp = pool.past(hd.h.hash);
    return closesOf(hd.id, pool).some(E => E.hash !== hd.h.hash && !hp.has(E.hash) && circleSaw(x, E, clock, pool)) && closedIn(hd.id, null, pool);
  };
  const endedParts = (hd, x) => {
    const hp = pool.past(hd.h.hash);
    const mine = t => (t.refs.as === undefined ? t.refs.author === hd.id : t.refs.as === hd.id);
    return drawsOnF.some(t => mine(t) && t.hash !== hd.h.hash && !hp.has(t.hash) && !addBack.has(t.hash) && circleSaw(x, t, clock, pool)) || closeSeen(hd, x);
  };
  const live = hd => hd.fixed === null && hd.id !== null;
  // whether a hand counts in a row at x, and with how much
  const weigh = (Ri, hd, x) => {
    if (!live(hd)) return null;
    const R = Ri.R;
    if (gives(hd.id) && !onNamesHer(R, hd.id, m, pool)) return null;
    if (R.parts !== undefined) { if (!hd.parts || !fpos(hd.parts) || endedParts(hd, x)) return null; return hd.parts; }
    const hp = pool.past(hd.h.hash), xp = pool.past(x.hash);
    if (!rowNamed(R.to, F, pool, h => h === hd.h.hash || hp.has(h)).includes(hd.id)) return null;
    if (!rowNamed(R.to, F, pool, h => h === x.hash || xp.has(h) || h === hd.h.hash || hp.has(h)).includes(hd.id) || closeSeen(hd, x)) return null;
    return { n: 1n, d: 1n };
  };
  const weighAll = (hd, x) => (live(hd) && hd.id !== F && hd.parts && fpos(hd.parts) && !endedParts(hd, x) ? hd.parts : null);
  // every part persons own (C6, D8): the pack, less the unissued parts the meter's receipt of the move states where any are unissued in its past
  let need = null;
  { const cp = hasPack ? circleParts(F, pool, pool.past(m.hash), addBack) : null;
    if (cp && cp.map) { need = dec(C.state.pack.value); if (fpos(cp.unissuedTitle)) { const s = unissuedStated(m, meter, pool); need = s === null ? null : fsub(need, s); } } }
  // an id counts once: of her hands, the one that weighs most (ties: the lowest block hash) counts; her others add nothing
  const best = (pick, present) => { const by = new Map(); for (const hd of present) { const w = pick(hd); if (!w || !fpos(w)) continue; const o = by.get(hd.id); if (!o || fcmp(w, o.w) > 0 || (fcmp(w, o.w) === 0 && hd.h.hash < o.hd.h.hash)) by.set(hd.id, { hd, w }); } return by; };
  const evalAt = x => {
    const xp = pool.past(x.hash), present = hands.filter(hd => hd.h.hash === x.hash || xp.has(hd.h.hash));
    for (const Ri of covering) {
      const by = best(hd => weigh(Ri, hd, x), present);
      const ok = Ri.R.parts !== undefined ? fcmp(fsumF([...by.values()].map(v => v.w)), dec(String(Ri.R.parts))) >= 0 : by.size >= Ri.R.needed;
      if (ok) return { row: Ri.i, every: false };
    }
    if (need !== null && fpos(need)) { const by = best(hd => weighAll(hd, x), present); if (fcmp(fsumF([...by.values()].map(v => v.w)), need) >= 0) return { row: null, every: true }; }
    return null;
  };
  // where it holds: the move or a confirm of it, the fewest blocks in its past first, ties by hash
  const cands = hands.map(hd => hd.h).filter(x => inW(x.hash)).sort((a, b) => pool.past(a.hash).size - pool.past(b.hash).size || cmp(a.hash, b.hash));
  let at = null, got = null;
  for (const x of cands) { const r = evalAt(x); if (r) { at = x; got = r; break; } }
  const holds = got !== null;
  // what each hand shows: where it holds, the hands in the causal past of `at`; else every hand held, read at the last candidate. Counts in the row read: the way that holds;
  // else the first row whose scope covers the move; else the every-owner way
  const x = at || cands[cands.length - 1] || m, xp = pool.past(x.hash);
  const shown = holds ? hands.filter(hd => hd.h.hash === x.hash || xp.has(hd.h.hash)) : hands;
  const read = holds ? (got.row !== null ? covering.find(Ri => Ri.i === got.row) : null) : (covering[0] || null);
  const by = best(hd => (read ? weigh(read, hd, x) : weighAll(hd, x)), shown);
  const out = shown.map(hd => {
    const c = by.has(hd.id) && by.get(hd.id).hd === hd;
    return { id: hd.id, block: hd.h.hash, parts: hasPack && hd.parts ? { value: fPrint(hd.parts), unit: 'part' } : null, counts: c, why: c ? null : hd.fixed || 'not_voice' };
  }).sort((a, b) => cmp(a.block, b.block));
  return { holds, row: holds ? got.row : null, every_owner: holds && got.every, at: at ? at.hash : null, hands: out, waiting: holds ? [] : [{ block: m.hash, on: 'hands' }] };
}
function rowHoldsMemo(m, F, pool) {
  const key = 'rh:' + m.hash + ':' + F, mine = pool.get(m.hash) === m;
  if (mine && pool.memo.has(key)) { const v = pool.memo.get(key); if (v.busy) { if (pool._inCircle) pool._taint = (pool._taint || 0) + 1; return { ...v, busy: undefined }; } return v; }
  if (mine) pool.memo.set(key, { holds: false, row: null, every_owner: false, at: null, hands: [], waiting: [{ block: m.hash, on: 'hands' }], busy: true }); // a ring reads as holding nothing
  const t0 = pool._taint || 0;
  const r = rowHoldsRaw(m, F, pool);
  if (mine) { if ((pool._taint || 0) === t0) pool.memo.set(key, r); else pool.memo.delete(key); }
  return r;
}
// the one answer: does a row hold for this block `as` its circle (C0, C10, C19, C9a)? null for a block that is not `as` a circle. A version holds by an `actor` row of the
// founding block (rowsFor) or every owner, and only where what it updates is the founding block or a version that holds (C19)
function circleHolds(b, pool) {
  if (b.refs.as === undefined) return null;
  const F = b.refs.as;
  const r = rowHoldsMemo(b, F, pool);
  if (!(isCircleBlock(b) && isStr(b.refs.updates)) || !r.holds) return r;
  const par = b.refs.updates === F || (() => { const p = pool.get(b.refs.updates); return !!p && isCircleBlock(p) && p.refs.as === F && isStr(p.refs.updates) && circleHolds(p, pool).holds; })();
  return par ? r : { ...r, holds: false, row: null, every_owner: false, at: null, waiting: [{ block: b.hash, on: 'hands' }] };
}
// authority.md, Ending (D17): a word `as` a circle is ended by a stop of its author while her hand could still count there
const stillHolds = (u, F, pool) => handCouldCount(u.refs.author, F, pool, pool.past(u.hash));
// whether a block `as` a circle holds by hands in a causal past alone (what a relying block can see of it)
function circleHoldsWithin(b, pool, within) {
  const F = b.refs.as;
  if (!isFoundingCircle(pool.get(F))) return false;
  if (isCircleBlock(b) && b.refs.updates !== undefined) return within.has(b.hash) ? circleHolds(b, pool).holds : false;
  return rowHoldsRaw(b, F, pool, { within }).holds;
}
// mayActAsIn: whether the block speaks for the circle it is `as`
function mayActAsIn(block, circleId, pool) {
  if (circleId === undefined || circleId === null) return true;
  if (block.refs.as !== circleId) return false;
  return circleHolds(block, pool).holds;
}
// ---- the doors
function circleFold(circleId, blocks, within) { return circleState(circleId, blocks, within); }
// circle_state: { founder, pack, owners, unissued, rules, clocks, meter } or null when the circle is not held; owners [{ owner, amount, no_person }] sorted, or { not_said: true }
function circleState(circleId, blocks, within) {
  const pool = poolOf(within ? [...poolOf(blocks).all().filter(x => x.hash !== within.hash), within] : blocks);
  const C = pool.get(circleId);
  if (!isFoundingCircle(C)) return null;
  const past = within ? pool.past(within.hash) : null;
  if (past && !past.has(circleId)) return null;
  const cn = circleNow(circleId, pool, past);
  const base = { founder: C.refs.author === undefined ? null : C.refs.author, pack: packOf(C) ? { ...packOf(C) } : null, rules: cn.rows, clocks: cn.clocks, meter: cn.meter };
  if (!packOf(C)) return { ...base, owners: { not_said: true }, unissued: null };
  const cp = circleParts(circleId, pool, past);
  if (cp.not_shown) return { not_shown: true, lacks: cp.lacks };
  // no_person: an owner that is a circle whose owners, followed through, are only circles and come back round (C5)
  const noPerson = (id, seen) => {
    if (!isFoundingCircle(pool.get(id))) return false;
    if (seen.includes(id)) return true;
    const c2 = circleParts(id, pool, past);
    if (!c2.title) return false;
    const others = [...c2.title.entries()].filter(([, a]) => fpos(a)).map(([o]) => o);
    return others.length > 0 && others.every(o => noPerson(o, [...seen, id]));
  };
  const owners = [...cp.map.entries()].filter(([, a]) => fpos(a)).map(([o, a]) => ({ owner: o, amount: { value: fPrint(a), unit: 'part' }, no_person: noPerson(o, [circleId]) })).sort((a, b) => cmp(a.owner, b.owner));
  return { ...base, owners, unissued: { value: fPrint(cp.unissuedTitle), unit: 'part' } };
}
// row_holds(block, held): the circle's judgement of a block signed `as` it; null where refs.as names no founding circle held
function rowHoldsOp(block, blocks) {
  if (!isObj(block) || !isObj(block.refs) || !isStr(block.refs.as)) return null;
  const pool = readWith(blocks, block);
  const b = pool.get(block.hash);
  const F = block.refs.as;
  if (!isFoundingCircle(pool.get(F))) return null;
  if (!b) return { circle: F, holds: false, row: null, every_owner: false, at: null, hands: [], waiting: [{ block: block.hash, on: 'hands' }], listed: [] };
  const r = circleHolds(b, pool);
  return { circle: F, holds: r.holds, row: r.row, every_owner: r.every_owner, at: r.at, hands: r.hands, waiting: r.waiting, listed: listedFor(b, F, pool) };
}
// C9b, the listing (a reading): where the move gives to an owner (an id owning parts by title), a tool of hers, or a circle in which her hand could count: the promises signed `as`
// the circle that hold, are not in the move's causal past, are not the move, and whose stage is not done, stopped or declined. Nothing is refused for it and no sum is run.
function listedFor(m, F, pool) {
  if (m.refs.as !== F) return [];
  const past = pool.past(m.hash);
  const cp = circleParts(F, pool, past);
  const who = cp.title ? [...cp.title.entries()].filter(([, a]) => fpos(a)).map(([id]) => id) : [];
  if (!who.some(s => movesGivesTo(m, s, F, pool))) return [];
  const words = pool.all().filter(w => w.type === 'promise' && w.refs.as === F && w.state.status === undefined && w.refs.answers === undefined && w.hash !== m.hash && !past.has(w.hash) && counts(w, pool) && rowHoldsMemo(w, F, pool).holds);
  return words.filter(w => { const st = promiseStage(w, pool); return st && !st.not_shown && !['done', 'stopped', 'declined'].includes(st.stage); }).map(w => w.hash).sort();
}
// ways_in(circle, held), a reading: { circle, rows: [{ row, least }], every_owner: { least } | null }; { not_shown, lacks }; null where the circle is not held
function waysIn(circleId, blocks) {
  const pool = poolOf(blocks);
  const C = pool.get(circleId);
  if (!isFoundingCircle(C)) return null;
  const cn = circleNow(circleId, pool, null);
  const cp = circleParts(circleId, pool, null);
  if (cp.not_shown) return { not_shown: true, lacks: cp.lacks };
  const persons = cp.title ? [...cp.title.entries()].filter(([, a]) => fpos(a)).map(([id]) => [id, partsOf(cp, id)]) : [];
  const every = cp.title && !(fpos(cp.unissuedTitle) && cn.meter === null) && persons.length ? persons.length : null;
  const rows = cn.rows.map((R, i) => {
    let least = null;
    if (isObj(R) && R.parts !== undefined) { const free = persons.map(([, a]) => a).sort((x, y) => fcmp(y, x)); let sum = F0; for (let k = 0; k < free.length; k++) { sum = fadd(sum, free[k]); if (fcmp(sum, dec(String(R.parts))) >= 0) { least = k + 1; break; } } }
    else if (isObj(R) && R.to !== undefined && Number.isInteger(R.needed)) least = rowNamed(R.to, circleId, pool, () => true).length >= R.needed ? R.needed : null;
    if (least !== null && every !== null) least = Math.min(least, every);
    return { row: i, least };
  });
  return { circle: circleId, rows, every_owner: every === null ? null : { least: every } };
}
// circle_versions: { circle, versions: [{ version, updates, author, holds, hands }], now }: versions only, sorted; now the standing version's id, else the founding block's
function circleVersions(circleId, blocks) {
  const pool = poolOf(blocks);
  const C = pool.get(circleId);
  if (!isFoundingCircle(C)) return null;
  const vs = circleVersionsOf(circleId, pool).map(v => { const r = circleHolds(v, pool); return { version: v.hash, updates: v.refs.updates, author: v.refs.author, holds: r.holds, hands: [...new Set(r.hands.filter(h => h.counts).map(h => h.id))].sort() }; });
  const cn = circleNow(circleId, pool, null);
  return { circle: circleId, versions: vs, now: cn.version === null ? circleId : cn.version };
}
// members_then(block, recipient): the owners of a circle's parts (by title: parts held for a sale count for the seller until the receiver's yes) in the circle fold of the block's
// causal past (C8); a name that is not a circle names no one
function membersThen(block, recipient, blocks) {
  if (!isStr(recipient)) return [];
  const pool = readWith(blocks, block);
  const F = recipient;
  if (!isFoundingCircle(pool.get(F))) return [];
  const past = pool.before(block.hash);
  if (!past.has(F)) return [];
  const cp = circleParts(F, pool, past);
  if (!cp.title) return [];
  return [...cp.title.entries()].filter(([, a]) => fpos(a)).map(([id]) => id).sort();
}
// circle_key (profiles/rekeys.md): key grants `as` the circle that a row holds for
function circleKey(circleId, blocks) {
  const pool = poolOf(blocks);
  const C = pool.get(circleId);
  if (!isFoundingCircle(C)) return { epoch: 0, keys: [], grants: [] }; // a circle the folds cannot read has no key
  const rekeys = pool.all().filter(b => b.type === 'grant' && b.state.kind === 'key' && b.state.epoch !== undefined && b.refs.subject === circleId && b.refs.as === circleId && counts(b, pool));
  const ok = new Set();
  for (const r of rekeys.sort((a, b) => a.state.epoch - b.state.epoch)) {
    if (!circleHolds(r, pool).holds) continue;
    const n = r.state.epoch;
    const prevOk = n === 1 ? asList(r.refs.after).includes(circleId) : asList(r.refs.after).some(h => ok.has(h) && pool.get(h).state.epoch === n - 1);
    if (prevOk) ok.add(r.hash);
  }
  const counted = rekeys.filter(r => ok.has(r.hash));
  const epoch = counted.length ? Math.max(...counted.map(r => r.state.epoch)) : 0;
  const top = counted.filter(r => r.state.epoch === epoch);
  const keys = (epoch === 0 ? [C.state.public_key_encrypt] : top.map(r => r.state.public_key_encrypt)).filter(Boolean).sort();
  return { epoch, keys, grants: top.map(r => r.hash).sort() };
}
// counted_in (profiles/ballots.md)
const countedIn = (result, commitment, counter) => result.refs.author === counter && asList(result.state.counted).includes(commitment);

// ================================================================ amounts (encoding.md, Shapes; folds.md, What each fold returns)
// An amount is { value, unit } or { value, unit, of }. Every sum is an exact fraction inside the oracle and one printed form outside it (fText). Nothing is rounded.
function dec(s) { const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(s)); if (!m) return null; const f = m[3] || ''; return { n: BigInt(m[1] + m[2] + f), d: 10n ** BigInt(f.length) }; }
// exact fractions { n, d } of decimals (core.md section 3: a decimal is exact at any size, never a float): sums and comparisons
const F0 = { n: 0n, d: 1n };
const frac = v => dec(v) || F0;
const fadd = (a, b) => ({ n: a.n * b.d + b.n * a.d, d: a.d * b.d });
const fsub = (a, b) => ({ n: a.n * b.d - b.n * a.d, d: a.d * b.d });
const fmul = (a, b) => ({ n: a.n * b.n, d: a.d * b.d });
const fdiv = (a, b) => { let n = a.n * b.d, d = a.d * b.n; if (d < 0n) { n = -n; d = -d; } return { n, d }; };
const fcmp = (a, b) => { const x = a.n * b.d - b.n * a.d; return x < 0n ? -1 : x > 0n ? 1 : 0; };
const fmin = (a, b) => (fcmp(a, b) <= 0 ? a : b);
const fmax = (a, b) => (fcmp(a, b) >= 0 ? a : b);
const fpos = a => a.n > 0n;
const fsum = vs => vs.reduce((t, v) => fadd(t, frac(v)), F0);
const fsumF = fs => fs.reduce((t, f) => fadd(t, f), F0);
const bgcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) { [a, b] = [b, a % b]; } return a; };
const fnorm = f => { const g = bgcd(f.n, f.d) || 1n; return { n: f.n / g, d: f.d / g }; };
// decimal strings (core.md section 3), compared exactly; NaN when either is not one
const decCmp = (x, y) => (isStr(x) && isStr(y) && RX.decimal.test(x) && RX.decimal.test(y) ? fcmp(dec(x), dec(y)) : NaN);
// THE one printed form of a sum (encoding.md, Shapes): the shortest decimal text, no exponent, a single 0 before the point, no trailing zero after it, no point when there is no
// fraction, 0 for nothing, never -0. null when the fraction has no finite decimal form (1/3): such a number is no sum anyone can write.
function fText(f) {
  const r = fnorm(f);
  let d = r.d, twos = 0, fives = 0;
  while (d % 2n === 0n) { d /= 2n; twos++; }
  while (d % 5n === 0n) { d /= 5n; fives++; }
  if (d !== 1n) return null;
  const k = Math.max(twos, fives), scaled = (r.n * 10n ** BigInt(k)) / r.d;
  const neg = scaled < 0n, a = neg ? -scaled : scaled, w = (a / 10n ** BigInt(k)).toString(), fr = k ? (a % 10n ** BigInt(k)).toString().padStart(k, '0').replace(/0+$/, '') : '';
  const t = w + (fr ? '.' + fr : '');
  return neg && t !== '0' ? '-' + t : t;
}
// a kind { unit, of } (of null for none) and the one test of "the same kind": the same unit text and the same of, or neither has one (encoding.md, Shapes)
const kindOf = a => ({ unit: a.unit, of: a.of === undefined ? null : a.of });
const sameKind = (a, b) => isObj(a) && isObj(b) && a.unit === b.unit && ((a.of === undefined || a.of === null) ? (b.of === undefined || b.of === null) : a.of === b.of);
const amtF = a => (isObj(a) && isStr(a.value) ? dec(a.value) : null);
// 1.9 3e-5: a figure a fold prints is the exact value of signed numbers: the shortest decimal text, of any length, where it has one; else `n/d`, two whole numbers in lowest terms, which no block may sign
const fPrint = f => { const t = fText(f); if (t !== null) return t; const r = fnorm(f); return r.n + '/' + r.d; };
const amtOut = (f, kind) => { const t = fPrint(f); if (t === null || !kind) return null; const o = { value: t, unit: kind.unit }; if (kind.of !== undefined && kind.of !== null) o.of = kind.of; return o; };
const isAmount = a => isObj(a) && shapeOf(a) === 'amount' && !amountProblem(a);
// what a price comes to (promises.md, Terms): a flat price is the total for the whole; { amount, per } is amount.value times the quantity over per.value, exact, the quantity
// of per's kind (nothing is converted); a per of zero, or a quotient with no decimal form, has no total. { f, kind } or null.
function totalOf(price, qty) {
  if (!isObj(price) || 'figure' in price) return null;
  if (!perUnit(price)) return isAmount(price) ? { f: dec(price.value), kind: kindOf(price) } : null;
  const a = price.amount, per = price.per;
  if (!isAmount(a) || !isAmount(per) || !isAmount(qty) || !sameKind(qty, per)) return null;
  const p = dec(per.value), q = dec(qty.value);
  if (p.n === 0n) return null;
  // 1.9 3e-4, 3e-5: no fold rounds and no test divides in a price test; a total that has no finite decimal form prints as `n/d` (never null for that reason)
  const f = fnorm(fdiv(fmul(dec(a.value), q), p));
  return { f, kind: kindOf(a) };
}
// each priced line of the terms (or the whole price at `chosen`) with what it comes to; qtyFor(i, q) may restate a line's quantity
const pricedParts = (terms, chosen, qtyFor = (i, q) => q) => (Array.isArray(terms.lines) ? terms.lines.map((l, i) => ({ price: l.price, qty: qtyFor(i, l.quantity) })) : [{ price: terms.price, qty: qtyFor(0, chosen) }])
  .filter(x => isObj(x.price)).map(x => totalOf(x.price, x.qty));
// the parts added: amounts of two kinds are never added (null), nor is a part with no total
function sumParts(parts) {
  if (!parts.length || parts.some(x => x === null)) return null;
  if (parts.some(x => !sameKind(x.kind, parts[0].kind))) return null;
  return { f: fsumF(parts.map(x => x.f)), kind: parts[0].kind };
}
// what a promise's terms come to (folds.md, A promise's stage): each priced line, or the whole at the quantity chosen (else the terms'); { f, kind } or null
// 1.9 3e-7 `step`: under a price, the least payable amount its signers take, an amount in the price's unit. The total is the least whole number of steps at or above the exact figure. With no `step`, the total is exact.
// 1.9-GUESS [3e-7]: a step in another unit than the price's, or at zero, is read as no step; with lines, the step rounds the sum
function stepUp(r, step) {
  if (!r || !isAmount(step) || step.unit !== r.kind.unit || !(step.of === undefined || step.of === (r.kind.of === null ? undefined : r.kind.of))) return r;
  const st = dec(step.value);
  if (!st || !fpos(st)) return r;
  const q = fnorm(fdiv(r.f, st));
  const n = q.n / q.d + (q.n % q.d > 0n ? 1n : 0n);
  return { f: fnorm(fmul({ n, d: 1n }, st)), kind: r.kind };
}
function termsTotalF(terms, qty) {
  const t = isObj(terms) ? terms : {};
  const parts = Array.isArray(t.lines) && t.lines.length ? pricedParts(t) : pricedParts({ price: t.price }, isObj(qty) ? qty : t.quantity);
  return stepUp(sumParts(parts), t.step);
}
function termsTotal(terms, qty) { const r = termsTotalF(terms, qty); return r ? amtOut(r.f, r.kind) : null; }

// ================================================================ a promise's stage (folds.md, promises.md)
// tookAt(r, hash, pool): the time a counted receipt carries a node's push answer, signed by a key of that node that still speaks, listing the hash as
// taken (decision D12, E1); null when it carries none. The receipt's own `derives_from` and the node it names are the caller's to ask.
function tookAt(r, hash, pool) {
  const an = r.state.answer;
  if (r.type !== 'observe' || r.state.kind !== 'receipt' || !counts(r, pool) || !isObj(an) || !isStr(an.node) || timeMs(an.at) === null || !Array.isArray(an.taken) || !an.taken.includes(hash)) return null;
  const idf = identityFold(an.node, pool);
  return idf.keys.some(k => answerSignedBy(an, k)) ? an.at : null;
}
// 1.9 R-B1, 3d-2 (stage 5 compare): an accept that is not in time binds by a relier's block (00-shared, Relier): a counted block of anyone but its signer that names it
// (in any ref but `author`, `prev`, `key` and `after`), other than a decline or a stop of it
function reliedOn(a, pool) {
  const s = speakerOf(a, pool);
  return pool.all().some(x => x.hash !== a.hash && x.type !== undefined && !((x.state.status === 'declined' || x.state.status === 'stopped') && asList(x.refs.answers).includes(a.hash)) &&
    Object.entries(x.refs).some(([k, v]) => !['author', 'prev', 'key', 'after'].includes(k) && asList(v).includes(a.hash)) && counts(x, pool) && speakerOf(x, pool) !== s);
}
// the order of stages, lowest first (folds.md, A promise's stage): offered or asked, declined, stopped (before), accepted, underway, stopped (onward), done, reversed; only the bench lowers it
const STAGE_RANK = o => (o.stage === 'stopped' ? (o.stop === 'onward' ? 5 : 2) : { offered: 0, asked: 0, expired: 0, declined: 1, accepted: 3, underway: 4, done: 6, reversed: 7 }[o.stage]);
function promiseStage(firstIn, poolIn, opts) {
  try {
    const r = promiseStageCore(firstIn, poolIn, opts);
    // accepts that bind and do not see each other cross: each binds, the deal is read once under each (`per_accept`), and the stage is the furthest of them
    if (r && !r.not_shown && r.crossed.length > 1 && !(opts && opts.only)) {
      const per = r.crossed.map(h => ({ h, st: promiseStageCore(firstIn, poolIn, { ...(opts || {}), only: h }) }));
      const best = per.slice().sort((x, y) => STAGE_RANK(y.st) - STAGE_RANK(x.st) || cmp(x.h, y.h))[0].st;
      const out = { ...best, crossed: r.crossed, forks: r.forks, requests: r.requests, per_accept: per.map(x => ({ accept: x.h, stage: x.st.stage, paid: x.st.paid, uncovered: x.st.uncovered, lines: x.st.lines })).sort((x, y) => cmp(x.accept, y.accept)) };
      if (best.paidUp !== undefined) Object.defineProperty(out, 'paidUp', { value: best.paidUp, enumerable: false });
      return out;
    }
    return r;
  } catch (e) { if (e && e.notShown) return { not_shown: true, lacks: e.lacks }; throw e; }
}
function promiseStageCore(firstIn, poolIn, opts) {
  // the first promise is read with the blocks held; one that rests on blocks not held is not read yet: no stage (folds.md)
  const pool = new Pool(typeof firstIn === 'string' ? poolOf(poolIn).all() : [firstIn, ...poolOf(poolIn).all()]);
  const P = pool.get(typeof firstIn === 'string' ? firstIn : firstIn.hash);
  if (!P) return null;
  const cover = b => {
    if (b.refs.under === undefined) return null;
    const g = pool.get(b.refs.under);
    // a grant that is not live, or not made for the block's author, is no grant: the block acts under none (folds.md, Who a block speaks for)
    if (!g || g.type !== 'grant' || !grantLive(g, pool, new Set(), b) || !receives(g, b, pool)) return null;
    // it is covered when it passes the door's whole authority test (authority.md)
    return { principal: principalOf(g, pool), covered: !whyNotUnder(b, pool).length };
  };
  const whoMemo = new Map();
  const who = b => { if (!whoMemo.has(b.hash)) whoMemo.set(b.hash, speakerOf(b, pool)); return whoMemo.get(b.hash); };
  // a promise is a quote request unless the grant it acts under covers its type (promises.md, invariant 22). A promise under no grant it acts under is
  // its author's own word, whoever the author is (a person, a machine): it speaks for its author and binds them alone.
  const quoteOffer = b => { const c = cover(b); return c ? !c.covered : false; };
  // an accept: a promise that says accepted, or her AI's reading "accepted under rule R" when R is her live grant and covers it (promises.md, Answers)
  const isAcc = b => (b.type === 'promise' && b.state.status === 'accepted') || (isMachineAccept(b, pool) && !!cover(b) && cover(b).covered);
  // an allocation starts its own deal (promises.md, Who may bind): the offerer's accepted answer to a request on an open offer. It is read with
  // the allocation as head and the offer as root; an allocation the open offer does not bind has no deal.
  // what an open offer caps its quantity at: the largest of a range, else the amount
  const capOf = o => { const q = termsOf(o).quantity; return q ? (q.max ? q.max : q) : null; };
  const alloc = (() => {
    if (P.type !== 'promise' || P.state.status !== 'accepted' || P.refs.answers === undefined) return null;
    // the request: an accept of the open offer, or a counter to it (decision H18: the offerer's accept of a counter to her open offer binds a deal
    // between the two, like an allocation)
    const R = pool.get(P.refs.answers);
    if (!R || R.type !== 'promise' || !(R.state.status === 'accepted' || R.state.status === undefined)) return null;
    // the open offer: what the request answers, through the counters of its chain
    let O = pool.get(R.refs.answers);
    while (O && O.type === 'promise' && O.refs.answers !== undefined && O.state.status === undefined) O = pool.get(O.refs.answers);
    if (!O || O.type !== 'promise' || O.refs.answers !== undefined || (O.refs.from !== undefined && O.refs.to !== undefined)) return null;
    // an open offer that speaks for neither of its sides has no stage, and so binds no allocation (folds.md, A promise's stage)
    const os = promiseStage(O, pool);
    if (os && os.not_shown) throw { notShown: true, lacks: os.lacks };
    const t = os && os.takers.find(x => x.allocation === P.hash);
    return t ? { O, R, t } : null;
  })();
  const Q = alloc ? alloc.O : P; // the root: sides, terms, what
  const out = { stage: null, stop: null, from: null, by: null, offer: Q.hash, accept: null, sides: { from: Q.refs.from === undefined ? null : Q.refs.from, to: Q.refs.to === undefined ? null : Q.refs.to }, quantity: null, takers: [], forks: [], lines: [], total: null, paid: null, stopped: [], disputed: [], due: null, paid_at: null, occurrences: [], referee_ties: [], crossed: [], per_accept: [], requests: [], waiting: [], bench: 'none', uncovered: { from: [], to: null }, unanswered: [], over_allocated: false, to_come: null, to_come_on: [], received_at: [], moved: [], price_fixed: null };
  // a side that names a thing is its owner where each block stands: the ownership fold of that block's causal past (promises.md, Bearer), so an
  // accept binds the holder that signed it, and a note passed on after it was redeemed binds no one again. An allocation's open side is its taker.
  const isThing = r => { const t = r !== undefined && pool.get(r); return !!t && t.type === 'thing'; };
  const ownerMemo = new Map();
  const sideAt = (key, b) => {
    const r = Q.refs[key];
    if (r === undefined || r === '') return alloc ? alloc.t.who : undefined;
    if (!isThing(r)) return r;
    const k = r + '|' + b.hash;
    if (!ownerMemo.has(k)) ownerMemo.set(k, ownershipFold(r, pool, pool.past(b.hash)).owner);
    return ownerMemo.get(k);
  };
  // the side a block speaks for, where it stands: 'from', 'to' or null
  const sideOfB = b => { const w = who(b); if (!isStr(w)) return null; return w === sideAt('from', b) ? 'from' : w === sideAt('to', b) ? 'to' : null; };
  // a fork voids what the forker claims, never what they owe (folds.md, A fork is a burden): a block of a fork (one of the pair, or a later block of that
  // key) still counts in a deal where it binds its signer or another's word stands on it; its stops and declines, which would free its signer by
  // their word alone, count for nothing, and so do its confirms and defeats (read below only where they count)
  const all = pool.all().filter(b => binds(b, pool));
  // the head too: a first promise (or allocation) whose key does not speak for its author is no word of theirs, owed or claimed (folds.md,
  // A fork is a burden): it has no stage
  if (!all.includes(P)) return null;
  // the deal: P, and every block that names P in for or answers a block in the deal. A promise with no answers is a new deal.
  const deal = new Map([[P.hash, P]]);
  for (let grew = true; grew;) {
    grew = false;
    for (const b of all) {
      if (deal.has(b.hash)) continue;
      const names = asList(b.refs.for).includes(P.hash) && !(b.type === 'promise' && b.refs.answers === undefined);
      if (names || (b.refs.answers !== undefined && deal.has(b.refs.answers)) || (b.refs.updates !== undefined && deal.has(b.refs.updates))) { deal.set(b.hash, b); grew = true; }
    }
  }
  // an updates of a promise is its author's stop (any other is refused, so no fold reads one: terms are fixed once written, promises.md):
  // it counts only when it speaks for the one the block it updates speaks for (the other side stops by answers)
  const D = [...deal.values()].filter(b => !(b.type === 'promise' && b.refs.updates !== undefined && b.refs.answers === undefined &&
    (!pool.get(b.refs.updates) || who(b) === null || who(b) !== who(pool.get(b.refs.updates)))));
  if (!sideOfB(Q)) return null; // a first promise that speaks for neither side is nobody's promise: no stage
  const open = !alloc && (Q.refs.from === undefined || Q.refs.to === undefined);
  // to yourself: both refs name its author (a note its issuer still holds is a promise to its holder, not to yourself)
  const self = !alloc && isStr(Q.refs.from) && !isThing(Q.refs.from) && Q.refs.from === Q.refs.to && Q.refs.from === who(Q);
  // ---- the live offers: P, or the latest counters between the same two sides, each signed by the side that did not sign the offer it answers
  // (not on an open offer). Two counters that cross both stand.
  // the live offers among the counters vis lets in (every one held, or those in an accept's causal past: an accept binds the offer live where it stands)
  const livesIn = vis => {
    let lives = [Q];
    if (open) return lives;
    for (;;) {
      const next = [];
      for (const o of lives) for (const c of D) {
        // a counter keeps the deal's two sides: its own from and to, where it names them, are the first promise's (promises.md)
        if (vis(c.hash) && c.type === 'promise' && c.refs.answers === o.hash && c.state.status === undefined && c.hash !== P.hash && sideOfB(c) && sideOfB(c) !== sideOfB(o) && !next.includes(c) &&
          (c.refs.from === undefined || c.refs.from === Q.refs.from) && (c.refs.to === undefined || c.refs.to === Q.refs.to) &&
          // a counter that has in its causal past an accept of the offer it answers ends nothing: a bound deal changes only by a stop (promises.md)
          !D.some(a => isAcc(a) && a.refs.answers === o.hash && sideOfB(a) && sideOfB(a) !== sideOfB(o) && pool.sees(c.hash, a.hash))) next.push(c);
      }
      if (!next.length) return lives;
      lives = next;
    }
  };
  const lives = livesIn(() => true);
  let live = lives[0];
  const stopsOfKind = kind => D.filter(b => b.type === 'promise' && b.state.status === 'stopped' && b.state.stop === kind && sideOfB(b));
  const stopsBefore = stopsOfKind('before');
  const onward = stopsOfKind('onward');
  const onwardFirst = earliest(onward, pool)[0];
  const declines = D.filter(b => (b.type === 'promise' && b.state.status === 'declined') || isDeclineReading(b));
  // a withdrawal stops the offer it names (its updates or answers): an accept of that offer binds unless the withdrawal is in its causal past
  const stopsOne = (s, h) => s.refs.updates === h || s.refs.answers === h;
  const seenStop = a => stopsBefore.some(s => stopsOne(s, a.refs.answers) && pool.sees(a.hash, s.hash));
  // an accept consents to the terms of the offer it answers (invariant 15): where the offer's quantity is a range, the accept names a quantity in the
  // range's unit, within it; otherwise it names none, or the same (promises.md, Who may bind)
  // a deal conditioned on another deal binding (terms.condition { accepted: <first promise> }, decision H17) binds only once that deal binds, read from
  // its own stage in the same blocks; one that names nothing held, or leads back to a deal being read, holds for nothing (no reading loops)
  const visiting = (opts && opts.visiting) || [];
  const conditionBinds = () => true; // 1.9 stage 5 (R-C2): a promise conditioned on another deal binds on its own accept; what it names is due only once that deal binds (Due)
  const fits = (a, o) => {
    const q = termsOf(o).quantity, x = termsOf(a).quantity;
    if (!isObj(q)) return x === undefined; // an offer with no quantity is accepted with none: an accept never adds one
    if ('min' in q || 'max' in q) {
      const unit = (q.min || q.max).unit;
      if (!isObj(x) || x.unit !== unit || !dec(x.value)) return false;
      return (q.min === undefined || (q.min.unit === unit && decCmp(q.min.value, x.value) <= 0)) && (q.max === undefined || (q.max.unit === unit && decCmp(q.max.value, x.value) >= 0));
    }
    return x === undefined || (isObj(x) && x.unit === q.unit && decCmp(x.value, q.value) === 0);
  };
  // ---- the bench (promises.md, Disputes): who confirms and who rules
  // a referee named after the quarrel: a grant of kind referee one side signs naming her (refs.to) for the deal (refs.subject, its first promise), which the other side
  // answers accepted; both signed, so she counts as a confirmer the grounds name (decision C8)
  // 1.9-GUESS [5-27] R-J2 (seat 17 B2; T3-7): a judge named after the deal bound counts on its bench only where each side, and every holder of what either side has to come, named her or answered her `accepted`
  let holdersFn = () => [];
  const judgesFor = (sides, subject = P.hash, bound = null) => {
    const sideOf = b => sides.find(x => who(b) === x);
    const answered = (g, w) => pool.all().some(a => a.type === 'grant' && a.state.status === 'accepted' && a.refs.answers === g.hash && counts(a, pool) && who(a) === w);
    return [...new Set(pool.all().filter(g => g.type === 'grant' && g.state.kind === 'referee' && g.state.status === undefined && g.refs.subject === subject && counts(g, pool) && sideOf(g) !== undefined &&
      isStr(g.refs.to) && pool.all().some(a => a.type === 'grant' && a.state.status === 'accepted' && a.refs.answers === g.hash && counts(a, pool) && sideOf(a) !== undefined && sideOf(a) !== sideOf(g)) &&
      (!bound || pool.sees(bound.hash, g.hash) || holdersFn().filter(h => !sides.includes(h)).every(h => who(g) === h || answered(g, h)))).map(g => g.refs.to))].sort();
  };
  // a side's disputes of a block (its counted defeats of it): a backup referee's turn starts from the receipt of one (decision E1)
  const disputesOf = h => pool.all().filter(o => asList(o.refs.defeats).includes(h) && counts(o, pool) && sideOfB(o)).map(o => o.hash);
  // the confirmers the bound offer's schema names in its grounds, in order, then the referees both sides named; less a side, or a role inside a side's
  // circle. A block of a side's, of an autonomous system a side runs (an operator grant in its causal past) or of a member of a side's circle there
  // confirms and rules on nothing (decision C7). A role is its holders where the word stands.
  const benchOf = (schema, sides, bound, subjects = [P.hash]) => {
    const grounds = schema && isObj(schema.state.grounds) ? schema.state.grounds : {};
    // a name that is a side adds nothing; a role inside a side's circle stays, its tie shown (decision H9)
    const notSide = w => isStr(w) && !sides.includes(w);
    const names = [...new Set([...asList(grounds.confirmers).filter(isStr), ...subjects.flatMap(x => judgesFor(sides, x, bound))].filter(notSide))];
    // no default in the protocol (decisions E3, H2): the number the schema states; one name needs none; more than one and no number stated is
    // no number (null), and nothing they say rules until both sides sign one
    const needed = Number.isSafeInteger(grounds.needed) && grounds.needed > 0 ? grounds.needed : names.length <= 1 ? 1 : null;
    const wait = isStr(grounds.wait) && parseDur(grounds.wait) ? grounds.wait : null;
    // a side alone never rules: not its own block, nor a block that speaks for a side. A referee both sides signed counts even when tied to a side
    // (a member of a side's circle, an autonomous system a side runs): the tie is shown in referee_ties (decision H9)
    const sided = o => sides.includes(o.refs.author) || sides.includes(who(o));
    // each name's ties to a side, from the blocks held: a role inside a side's circle, a member of a side's circle, an autonomous system a side runs
    const ties = sideList => {
      const out = [];
      for (const n of names) for (const [side, x] of sideList) {
        if (!isStr(x)) continue;
        const c = circleState(x, pool);
        if (c && Array.isArray(c.owners) && c.owners.some(o => o.owner === n)) out.push({ referee: n, side, how: 'member' }); // folds.md: `how` `member`, the name owns parts of the side's circle (roles are gone)
      }
      const key = t => [t.referee, t.side, t.how];
      return out.sort((a, b) => { const p = key(a), q = key(b); for (let i = 0; i < 3; i++) if (p[i] !== q[i]) return cmp(p[i], q[i]); return 0; });
    };
    const holdsName = (o, n) => counts(o, pool) && n === o.refs.author && !sided(o);
    const named = o => names.some(n => holdsName(o, n));
    // a name's words on a block: her `confirms` and `defeats` that count for her place (holdsName). Her verdict: false where a `defeats` of hers has no `confirms` of hers after it, else true where she confirmed, else null.
    const wordsOf = (n, h) => pool.all().filter(c => (asList(c.refs.confirms).includes(h) || asList(c.refs.defeats).includes(h)) && holdsName(c, n));
    const verdict = (words, h) => {
      const yes = words.filter(c => asList(c.refs.confirms).includes(h)), no = words.filter(c => asList(c.refs.defeats).includes(h));
      if (no.some(d => !yes.some(c => pool.sees(c.hash, d.hash)))) return false;
      return yes.length ? true : null;
    };
    const voice = (n, h) => verdict(wordsOf(n, h), h);
    // 1.9-GUESS [5-26] A backup referee (promises.md, Disputes; 1.9 3d-3): with `grounds.wait` the names are a chain, each the backup of the one before. A later name's turn begins where `needed` lines each hold a cutoff (a span no shorter than the wait, running from that line's receipt of a side's dispute of the block)
    // with no word of an earlier name received before it: the lines of the clocks the grounds name that no side keeps (`grounds.clocks`), or the earlier name's own line. A side's own clock starts no turn against the other side.
    const gclocks = clocksOf(grounds.clocks);
    const waitMs = wait ? spanMs(wait) : null;
    const startsFor = (i, h) => {
      // a side's dispute: its counted `defeats` of a block of the deal (the bench's turn runs from the dispute, whichever block it names)
      const disputes = pool.all().filter(o => asList(o.refs.defeats).length && counts(o, pool) && sides.includes(who(o))).map(o => o.hash), starts = [];
      const lineStarts = (name) => {
        const owner = (x => (x && isStr(x.refs.author) ? x.refs.author : name))(pool.get(name));
        if (sides.includes(owner)) return null;
        const rs = receiptsOn(name, h, pool).filter(() => false).concat(clockLine(name, pool).filter(o => o.type === 'observe' && o.state.kind === 'receipt' && asList(o.refs.derives_from).some(x => disputes.includes(x))));
        for (const r of rs) for (const c of clockLine(name, pool).filter(o => o.type === 'observe' && o.state.kind === 'cutoff' && asList(o.refs.derives_from).includes(r.hash) && isStr(o.state.when) && spanMs(o.state.when) !== null && spanMs(o.state.when) >= waitMs)) {
          const earlierWords = names.slice(0, i).flatMap(e => wordsOf(e, h));
          if (!earlierWords.some(w => receiptsOn(name, w.hash, pool).some(x => placedBefore(pool, x, c)))) return c;
        }
        return null;
      };
      if (gclocks) { const cs = gclocks.names.map(lineStarts); if (cs.filter(Boolean).length >= gclocks.needed) starts.push(cs.filter(Boolean)); }
      const own = lineStarts(names[i - 1]); if (own) starts.push([own]);
      return starts;
    };
    // a later name's word counts when it has that turn's start in its causal past and no word of an earlier name on the block in its causal past; once it counts, an earlier name's word it had not seen counts for nothing
    const validWords = (i, h) => wordsOf(names[i], h).filter(w => {
      if (i === 0) return true;
      const past = pool.past(w.hash);
      if (names.slice(0, i).some(e => wordsOf(e, h).some(x => past.has(x.hash)))) return false;
      return startsFor(i, h).some(set => set.every(c => past.has(c.hash)));
    });
    const turn = () => names.map(n => [n, null]);
    const ruling = h => {
      if (wait) {
        for (let i = names.length - 1; i >= 0; i--) { const v = verdict(validWords(i, h), h); if (v !== null) return v; }
        return null;
      }
      const said = names.map(n => [n, voice(n, h)]);
      const by = v => said.filter(x => x[1] === v).map(x => x[0]);
      return quorum(by(false), needed) ? false : quorum(by(true), needed) ? true : null;
    };
    return { names, needed, wait, clocks: gclocks, holdsName, named, voice, turn, ruling, ties };
  };
  // ---- binding accepts
  let accept = null, takers = [], forks = [], freedBy = () => false; // freedBy: an allocation stopped onward, its quantity freed
  const requestsOut = []; let crossedOut = []; let spotAccept = null;
  // forks: blocks of a pair in the deal (one key, one `prev` or one `seq`): a pair never frees its signer
  const pairsInDeal = () => { const ds = new Set(D.map(x => x.hash)); return [...new Set(forkPairs(pool).flat().filter(h => ds.has(h)))].sort(); };
  // a counter's deal has the counter's own terms, whole (decision H18)
  if (alloc) { accept = P; takers = [alloc.t]; if (alloc.R.state.status === undefined) live = alloc.R; }
  else if (self) accept = P;
  else if (!open) {
    // 1.9-GUESS [5-1] 1.9 stage 5 (promises.md, Who may bind): an answer binds the live offer it answers when it stands and its open points are closed; until then it is a request, listed in `requests` with what is open: `when`, `whose`.
    // A decline ends a standing word for its signer: an accept that has her own side's decline of that word in its causal past binds nothing (R-B3). A later decline of an accept reaches nothing that binds.
    const cands = [];
    const sideDeclined = (a, o) => declines.some(d => d.refs.answers === o.hash && sideOfB(d) === sideOfB(a) && pool.sees(a.hash, d.hash));
    // every offer of the deal (the first promise and its counters); an accept binds the one it answers when that was live where it stands
    for (const o of [Q, ...D.filter(x => x.type === 'promise' && x.state.status === undefined && x !== Q && x.refs.answers !== undefined)]) {
      const oSide = sideOfB(o);
      // the principal's own yes: an accept that speaks for the grantor of the grant the quote request was made under, itself no quote request; a bare
      // autonomous system has no principal, and nothing makes its word bind (promises.md, invariant 22)
      const c = cover(o);
      const principal = c ? c.principal : null;
      const principalOk = !quoteOffer(o) || (principal !== null && D.some(b => isAcc(b) && b.refs.answers === o.hash && who(b) === principal && !quoteOffer(b)));
      for (const a of D) {
        if (!isAcc(a) || a.refs.answers !== o.hash || !sideOfB(a) || sideOfB(a) === oSide || quoteOffer(a) || !fits(a, o) || sideDeclined(a, o)) continue;
        // a withdrawal in its causal past: it binds nothing (a stop of an offer that no accept binds is a withdrawal, whichever word it carries)
        if (seenStop(a) || !principalOk) continue;
        { const vis = pool.past(a.hash); if (!livesIn(h => vis.has(h)).includes(o)) continue; }
        // a referee's ruling reaches the accept too (promises.md, Disputes): an accept the deal's referee defeats binds nothing
        { const sides = ['from', 'to'].map(k => sideAt(k, a)).filter(isStr); if (benchOf(o.refs.schema && pool.get(o.refs.schema), sides, a).ruling(a.hash) === false) continue; }
        const open = [];
        // WHEN, if the offer carries `expires` (1.9 3d-2): with a clock, when `needed` lines received the accept before their cutoff through `expires`; with none, an accept is in time only by its own `at`, before `expires`; one that is not in time binds only by the offerer's own later block
        // (a block of her side that has it in its causal past and is no decline of it) or a relier's counted block (a third person's) that has it in its past. A receipt or a date of the offerer's side is his word, read against him alone.
        const exp = termsOf(o).expires;
        if (exp !== undefined) {
          const ks = clocksOf(termsOf(o).clocks);
          const inTime = ks !== null ? (isStr(exp) && inTimeByClock(a.hash, ks, pool, exp)) : (isStr(exp) && isStr(a.state.at) && a.state.at < exp);
          const actedOn = D.some(x => x !== a && sideOfB(x) === oSide && !(x.state.status === 'declined' && x.refs.answers === a.hash) && pool.sees(x.hash, a.hash));
          const relied = reliedOn(a, pool);
          if (!(inTime || actedOn || relied)) open.push('when');
        }
        // WHOSE, if the answer or the offer is waiting (a key with a reach, a grant whose end has not been passed, a word not yet signed twice): when it stands
        { const sa = standsOf(a, pool), so = standsOf(o, pool); if ((!sa.stands && sa.waiting.length) || (!so.stands && so.waiting.length)) open.push('whose'); }
        // stage 5 compare (R-B3, R-H2): an accept that does not bind and that the offerer declined, on an offer with `expires`, is ended: no longer a request
        const ended = exp !== undefined && D.some(x => x.state.status === 'declined' && x.refs.answers === a.hash && sideOfB(x) === oSide);
        if (open.length) { if (!ended) requestsOut.push({ block: a.hash, open: open.sort() }); continue; }
        if (!cands.includes(a)) cands.push(a);
      }
    }
    // 1.9-GUESS [5-6] each binds; accepts of one deal that bind and do not see each other CROSS (the deal is read once under each, `per_accept`); the stage is the furthest of them
    let firsts = earliest(cands, pool);
    if (opts && isStr(opts.only)) firsts = firsts.filter(x => x.hash === opts.only);
    crossedOut = firsts.length > 1 ? firsts.map(x => x.hash).sort() : [];
    forks = pairsInDeal();
    accept = firsts.slice().sort(byHash)[0] || null;
    // 1.9 stage 5 (R-P5; things.md, A spot exchange): the buyer signs first, an order naming the instance and its price; the seller's transfer `for` it, `to_owner` her, of that instance, is his yes and his delivery in one block: the deal binds there
    if (!accept && sideOfB(Q) === 'to' && Q.state.status === undefined && Q.refs.what !== undefined && isObj(termsOf(Q)) && termsOf(Q).price !== undefined && !(opts && isStr(opts.only))) {
      const spots = D.filter(b => b.type === 'transfer' && b.state.status === undefined && b.refs.answers === undefined && b.state.covers !== undefined && asList(b.refs.for).includes(P.hash) && sideOfB(b) === 'from' && b.refs.to_owner === who(Q) &&
        asList(b.refs.what).some(h => asList(Q.refs.what).includes(h)) && counts(b, pool));
      accept = earliest(spots, pool).sort(byHash)[0] || null;
      if (accept) spotAccept = accept;
    }
    if (accept && accept !== spotAccept) live = pool.get(accept.refs.answers) || live;
  } else {
    // an open offer binds only through the offerer's allocation: its own accepted answer to an accept
    const offKey = sideOfB(Q), openKey = offKey === 'from' ? 'to' : 'from';
    // a counter in a chain on the open offer: the first by someone other than its offerer (the taker), each next by the side that did not sign
    // the one it answers, all keeping the offerer's side and, on the open side, the taker. A counter that has in its causal past an accept of a
    // counter before it (by the side that did not sign that one) ends nothing.
    const offerer = who(Q), openOk = Q.refs[offKey];
    const keeps = (b, taker) => (b.refs[offKey] === undefined || b.refs[offKey] === openOk) && (b.refs[openKey] === undefined || (isStr(taker) && b.refs[openKey] === taker));
    const opposite = (c, taker, x) => who(c) === offerer ? who(x) === taker : who(x) === offerer;
    const chain = []; // { c, taker, parent }
    for (const c of D) if (c.type === 'promise' && c.state.status === undefined && c.refs.answers === P.hash && who(c) !== offerer && !quoteOffer(c) && conditionBinds(Q) && keeps(c, who(c))) chain.push({ c, taker: who(c), parent: null });
    for (let i = 0; i < chain.length; i++) {
      const { c, taker } = chain[i];
      for (const n of D) {
        if (n.type !== 'promise' || n.state.status !== undefined || n.refs.answers !== c.hash || chain.some(x => x.c === n) || quoteOffer(n) || !conditionBinds(Q) || !keeps(n, taker) || !opposite(c, taker, n)) continue;
        let ended = false;
        for (let j = i; j !== null; j = chain[j].parent) ended = ended || D.some(a => isAcc(a) && a.refs.answers === chain[j].c.hash && opposite(chain[j].c, taker, a) && pool.sees(n.hash, a.hash));
        if (!ended) chain.push({ c: n, taker, parent: i });
      }
    }
    const takerOf = r => { const x = chain.find(y => y.c === r); return x ? x.taker : who(r); };
    const counterReq = b => chain.some(x => x.c === b);
    const requests = quoteOffer(Q) || !conditionBinds(Q) ? chain.map(x => x.c) : D.filter(b => (isAcc(b) && b.refs.answers === P.hash && who(b) !== who(Q)) || counterReq(b));
    // the first counter of a request's chain: one chain is allocated once
    const headOf = r => { let c = r; while (c.refs.answers !== P.hash && pool.get(c.refs.answers) && pool.get(c.refs.answers).state.status === undefined) c = pool.get(c.refs.answers); return c.hash; };
    // an allocation: an accepted answer to a request, by the offerer for an accept, else by the side that did not sign the counter, and when no
    // counter of the chain that answers it is in its causal past
    const allocOf = b => {
      if (b.type !== 'promise' || b.state.status !== 'accepted') return false;
      const r = requests.find(x => x.hash === b.refs.answers);
      if (!r) return false;
      if (r.state.status !== undefined) return who(b) === offerer;
      return opposite(r, takerOf(r), b) && !chain.some(x => x.c.refs.answers === r.hash && pool.sees(b.hash, x.c.hash));
    };
    // listed in the order of their `seq` (an allocation is a draw on the offerer's line; the hash only breaks a tie in the listing, and picks nothing)
    // DECIDED (03-amounts, What building changed): [S3-19] allocations are read in the order of their `seq` (the offerer's line); a hash only breaks a tie in the listing, and picks nothing
    const allocs = D.filter(allocOf).sort((a, b) => ((a.state.seq || 0) - (b.state.seq || 0)) || byHash(a, b));
    const cap = capOf(Q), floor = isObj(termsOf(Q).quantity) && isObj(termsOf(Q).quantity.min) ? termsOf(Q).quantity.min : null;
    // a taker withdraws her request as an author withdraws an offer: an allocation binds nothing once her withdrawal is in its causal past
    const withdrawn = (r, a) => D.some(w => w.type === 'promise' && w.state.status === 'stopped' && w.state.stop === 'before' && w.refs.updates === r.hash && pool.sees(a.hash, w.hash));
    // a stopped allocation frees its quantity: an onward stop of it by either side of its deal (the offerer's updates, the taker's answers), for the
    // allocations that see the stop
    const stopsAlloc = (w, t) => w.type === 'promise' && w.state.status === 'stopped' && w.state.stop === 'onward' &&
      ((w.refs.updates === t.allocation && who(w) === who(pool.get(t.allocation))) || (w.refs.answers === t.allocation && (who(pool.get(t.allocation)) === who(Q) ? who(w) === t.who : who(w) === who(Q))));
    const stoppedFor = (t, a) => D.some(w => stopsAlloc(w, t) && pool.sees(a.hash, w.hash));
    freedBy = t => D.some(w => stopsAlloc(w, t));
    for (const a of allocs) {
      // every allocation the offerer signed binds the offerer (decision C2): two that do not see each other prove her lie (forks), and a lie never
      // frees the liar; allocations that together bind more than she offered are her broken promise, owed to each taker
      for (const t of takers) if ((who(pool.get(t.allocation)) === who(a)) && !pool.sees(a.hash, t.allocation)) forks.push(t.allocation, a.hash);
      const r = requests.find(x => x.hash === a.refs.answers);
      if (withdrawn(r, a)) continue;
      // a referee's ruling reaches an allocation as it reaches an accept (decision E5, one rule for every deal): an allocation, or the request it
      // answers, that the deal's referee defeats binds nothing; the bench is the open offer's schema's, between its offerer and this taker, with any
      // referee both named for the offer or for the allocation's own deal
      // (a counter's deal is read by the counter's own schema, as any bound offer's)
      { const sides = [sideAt(sideOfB(Q), a), takerOf(r)].filter(isStr); const sch = (r.state.status === undefined ? r : Q).refs.schema; const b = benchOf(sch && pool.get(sch), sides, a, [P.hash, a.hash]); if (b.ruling(a.hash) === false || b.ruling(r.hash) === false) continue; }
      // one request is allocated once: a later allocation of a request an allocation already binds (not stopped in this one's causal past) binds nothing
      if (takers.some(t => headOf(pool.get(t.request)) === headOf(r) && !stoppedFor(t, a))) continue;
      const asked = termsOf(r).quantity || null;
      const q = termsOf(a).quantity || asked;
      const isCounter = r.state.status === undefined;
      // the offerer's accept of a counter keeps to the counter, as any accept keeps to the offer it answers (invariant 15), and binds an amount
      if (isCounter && !(fits(a, r) && (!q || (isObj(q) && q.value !== undefined)))) continue;
      // an allocation binds a taker to no more than she asked for: where her request names a quantity, one in its unit and no larger
      if (!isCounter && asked && !(isObj(q) && q.unit === asked.unit && dec(q.value) && decCmp(q.value, asked.value) <= 0)) continue;
      // on a limited offer an allocation (or its request) names a quantity in the offer's unit, or it binds nothing; on a range, no less than its min
      // (promises.md, Who may bind)
      if (cap && !(isAmount(q) && sameKind(q, cap))) continue;
      if (cap && floor && sameKind(floor, cap) && fcmp(frac(q.value), frac(floor.value)) < 0) continue;
      takers.push({ who: takerOf(r), request: r.hash, allocation: a.hash, quantity: q });
    }
    // each allocation is a draw on the open offer's quantity, along the offerer's line (folds.md, What is left): one that does not take still binds her and is shown
    // over-allocated. An offer with lines is one whole: its first allocation that takes takes all of it. With no quantity stated there is no measure to draw on.
    {
      const withLines = Array.isArray(termsOf(Q).lines), start = Q;
      // DECIDED (03-amounts, What building changed): [S3-18] an open offer with no `quantity` and no `lines` states no measure: none of its allocations is over-allocated
      if (takers.length && (withLines || cap)) {
        const measure = withLines ? { kind: null, said: false, byUnit: false, firsts: [{ owner: who(Q), start, f: WHOLE }], adds: [] } : { kind: kindOf(cap), said: true, byUnit: false, firsts: [{ owner: who(Q), start, f: dec(cap.value) }], adds: [] };
        // the draw is the offerer's own word on her quantity: her allocation, or, where the taker's accept of her counter binds (a chain), that counter of
        // hers (end pass 2026-11-20: the taker's accept is no draw on the offerer's line; the core reads it so)
        const drawOf = t => { const al = pool.get(t.allocation), rq = pool.get(t.request); return who(al) === who(Q) || !rq || who(rq) !== who(Q) ? al : rq; };
        const draws = takers.map(t => ({ block: drawOf(t), by: who(drawOf(t)), to: t.who, amount: withLines ? null : t.quantity, lands: 'never', stays: false, kind: 'allocation', freers: D.filter(w => stopsAlloc(w, t)).map(w => w.hash) }));
        const r = drawsOn(pool, measure, draws, { seen: () => true });
        if (r.not_shown) throw { notShown: true, lacks: r.lacks };
        for (const t of takers) { const e = r.entries.find(x => x.block === drawOf(t).hash); t.over_allocated = !!e && !e.takes; }
      } else for (const t of takers) t.over_allocated = false;
    }
    forks = [...new Set(forks)];
    // WHICH: a request on an open offer binds only by the offerer's yes, the allocation: until then it is a request
    for (const r of requests) if (!takers.some(t => headOf(pool.get(t.request)) === headOf(r)) && !requestsOut.some(x => x.block === r.hash)) requestsOut.push({ block: r.hash, open: ['which'] });
    if (takers.length) accept = pool.get(takers[0].allocation);
  }
  out.takers = takers; out.forks = forks.sort();
  out.crossed = crossedOut; out.per_accept = []; out.requests = requestsOut.sort((x, y) => cmp(x.block, y.block));
  // a block of the deal that speaks for a side and does not yet stand is listed in `waiting` (blocks.md, Finality) and counts nowhere yet
  for (const b of D) { if (!isStr(b.refs.author) || !who(b)) continue; const st = standsOf(b, pool); for (const wv of st.waiting) if (!out.waiting.some(x => x.block === b.hash && x.on === wv.on)) out.waiting.push({ block: b.hash, on: wv.on }); }
  out.waiting.sort((x, y) => cmp(x.block, y.block) || cmp(x.on, y.on));
  // the offer the binding accept answers; with none, the live offer when there is only one
  out.offer = accept ? live.hash : (lives.length === 1 ? lives[0].hash : null);
  out.live = lives.map(o => o.hash).sort();
  out.accept = accept ? accept.hash : null;
  if (accept) out.accept = accept.hash;
  // before a binding accept nothing is chosen or settled: the quantity, total, lines and paid stay empty. A block sent despite a live STOP is kept;
  // consent decides what binds: the ask is read as declined in advance (consent.md)
  if (!accept) {
    { const b0 = benchOf(Q.refs.schema && pool.get(Q.refs.schema), [Q.refs.from, Q.refs.to].filter(isStr), null); out.bench = b0.names.length ? { names: b0.names, needed: b0.needed, wait: b0.wait, clocks: b0.clocks } : 'none'; }
    if (lives.every(o => stopsBefore.some(s => stopsOne(s, o.hash)))) { out.stage = 'stopped'; out.stop = 'before'; }
    else if (!open && lives.some(o => declines.some(d => d.refs.answers === o.hash && sideOfB(d) && sideOfB(d) !== sideOfB(o)))) out.stage = 'declined';
    else if (!open && consentFold(sideOfB(Q) === 'from' ? Q.refs.to : Q.refs.from, Q.refs.author, pool, Q).word === 'stop') out.stage = 'declined';
    else out.stage = sideOfB(Q) === 'to' ? 'asked' : 'offered';
    return out;
  }
  // an open offer is settled by no one: each allocation is a deal of its own (promises.md, Who may bind). What is left to say of the offer itself is
  // that it binds, or that its offerer stopped it onward.
  if (open && accept) {
    // its quantity is what its allocations bind together, and its total is what the price comes to for that
    const offered = capOf(Q);
    const withQ = takers.filter(t => isAmount(t.quantity));
    const kindQ = offered ? kindOf(offered) : (withQ.length ? kindOf(withQ[0].quantity) : null);
    // the sum of the takers' quantities that take, in the offer's kind: an allocation that does not take, or that was stopped onward, binds no more of the offer's quantity
    const bound = withQ.filter(t => kindQ && sameKind(t.quantity, kindQ) && !freedBy(t) && t.over_allocated !== true);
    if (bound.length) out.quantity = amtOut(fsum(bound.map(t => t.quantity.value)), kindQ);
    out.over_allocated = takers.some(t => t.over_allocated === true);
    const pr = termsOf(Q).price;
    // a counter its offerer accepted binds at the counter's own price (decision H18): the total is then the price of what the requests bind plus each
    // counter's own total, of one kind (several kinds, or a price with no total: null)
    const counterOf = t => { const r = pool.get(t.request); return r && r.state.status === undefined ? r : null; };
    if (!bound.some(counterOf)) {
      const t = totalOf(pr, out.quantity);
      if (t !== null) out.total = amtOut(t.f, t.kind);
    } else {
      const inKind = t => (isAmount(t.quantity) && kindQ && sameKind(t.quantity, kindQ) ? t.quantity : undefined);
      const mine = bound.filter(t => !counterOf(t)).map(inKind).filter(Boolean).map(x => x.value);
      const ps = [];
      if (mine.length) ps.push(totalOf(pr, { ...kindQ.of ? { of: kindQ.of } : {}, unit: kindQ.unit, value: fText(fsum(mine)) }));
      for (const t of bound.filter(counterOf)) { const cp = termsOf(counterOf(t)).price; ps.push(totalOf(cp, inKind(t))); }
      const r2 = sumParts(ps);
      if (r2) out.total = amtOut(r2.f, r2.kind);
    }
    // only a stop of the offer itself stops it: the offerer's stop of one allocation ends that allocation's deal alone
    const ow = earliest(onward.filter(b => who(b) === who(Q) && stopsOne(b, Q.hash)), pool)[0];
    if (ow) { out.stage = 'stopped'; out.stop = 'onward'; out.from = ow.hash; out.by = sideOfB(ow) === 'from' ? 'from' : 'to'; } else out.stage = 'accepted';
    return out;
  }
  // the quantity chosen
  // the terms are those of the offer the binding accept answers (promises.md: an accept consents to the block it names)
  // a price fixed later (promises.md, Terms): read as the flat amount it comes to once fixed; until then it has no total
  const fixing = fixingOf(termsOf(live), P, pool);
  const terms = fixing && fixing.fixed ? { ...termsOf(live), price: fixing.price } : termsOf(live);
  // the quantity chosen is an amount: a range is what may be chosen, not a choice (promises.md, Who may bind)
  const amountOf = q => (isAmount(q) ? q : null);
  const chosen = (takers.length === 1 ? amountOf(takers[0].quantity) : accept && accept !== P ? amountOf(termsOf(accept).quantity) : null) || amountOf(terms.quantity);
  out.quantity = chosen;
  // total: each priced line (or the whole) comes to its flat amount, or its amount per unit times its quantity over per (in per's kind). A price whose total cannot be
  // computed (no quantity in its kind, a per of zero, no finite decimal) is never paid: the promise is never done, and its total is null (folds.md)
  const parts = pricedParts(terms, chosen);
  const computable = parts.every(x => x !== null);
  const totalR = computable && parts.length ? stepUp(sumParts(parts), terms.step) : null;
  let totalF = totalR ? totalR.f : null, kindP = totalR ? totalR.kind : null; // kindP: the kind the price is in
  let total = totalR ? amtOut(totalF, kindP) : null;
  out.total = total;
  out.price_fixed = fixing ? fixing.fixed : null;
  const notShown = r => { throw { notShown: true, lacks: r.lacks }; };
  // ---- what is owed (promises.md, Owed): what each side is owed, and the hand-overs of it, each a draw on what its signer is owed (folds.md, What is left)
  // The `to` side is owed what moves (the quantity chosen, or one whole), the `from` side the price. A side that names a thing is Bearer's, never read here.
  const toComeSide = k => { const r = Q.refs[k]; if (self || (r !== undefined && r !== '' && isThing(r))) return null; const w = sideAt(k, accept); return isStr(w) && w !== '' ? w : null; };
  const toComeCands = self ? [] : pool.all().filter(t => t.type === 'transfer' && asList(t.refs.what).includes(P.hash) && t.state.status === undefined && t.refs.answers === undefined && t.refs.to_owner !== undefined &&
    (counts(t, pool) || forkedOnly(t, pool)) && pool.sees(t.hash, accept.hash));
  const toComeActive = toComeCands.length > 0;
  const toComeMemo = new Map();
  const startFor = o => [accept, P, Q].find(b => b && speakerOf(b, pool) === o) || accept;
  // DECIDED (03-amounts, What building changed): [S3-28] a hand-over is a draw on the side its signer is owed on (what moves, or the price): it is listed under the side where it does not read `not_owner`, `unit` or `no_measure`; each side's owner starts at
  // the binding accept or the offer, whichever that side signed; `owed` is null until a counted hand-over of the deal is held
  const toComeRead = (vis, key) => {
    if (toComeMemo.has(key)) return toComeMemo.get(key);
    const toOwner = toComeSide('to'), fromOwner = toComeSide('from');
    const cands = toComeCands.filter(t => vis(t.hash));
    const toM = chosen ? { kind: kindOf(chosen), said: true, byUnit: true, f0: dec(chosen.value) } : { kind: null, said: false, byUnit: false, f0: WHOLE };
    const fromM = !fixing && totalF && kindP ? { kind: kindP, said: true, byUnit: true, f0: totalF } : null;
    const run = (owner, m) => {
      if (!m || !isStr(owner)) return null;
      const draws = cands.map(t => ({ block: t, by: speakerOf(t, pool), to: asList(t.refs.to_owner)[0], amount: isAmount(t.state.amount) ? t.state.amount : null, lands: 'accept', stays: true, kind: 'transfer' }))
        .filter(d => isStr(d.by) && (!d.amount || fpos(dec(d.amount.value))));
      const r = drawsOn(pool, { kind: m.kind, said: m.said, byUnit: m.byUnit, firsts: [{ owner, start: startFor(owner), f: m.f0 }], adds: [] }, draws, { seen: vis });
      if (r.not_shown) notShown(r);
      return r;
    };
    const rTo = run(toOwner, toM), rFrom = run(fromOwner, fromM);
    const ownersOf = (r, m) => (r ? [...r.owners.entries()].filter(([, f]) => fpos(f)).sort((a, b) => cmp(a[0], b[0])).map(([owner, f]) => ({ owner, f, amount: m.said ? amtOut(f, m.kind) : null })) : []);
    const toList = ownersOf(rTo, toM), fromList = ownersOf(rFrom, fromM);
    // a hand-over is a draw on the side its signer is owed on; the side where it does not read as "not the owner" is the one it is listed under
    const merged = new Map();
    const worth = e => (e.takes ? 3 : !['not_owner', 'unit', 'no_measure'].includes(e.why) ? 2 : 1);
    for (const r of [rTo, rFrom]) if (r) for (const e of r.entries) { const have = merged.get(e.block); if (!have || worth(e) > worth(have.e)) merged.set(e.block, { e, r }); }
    const drawsOut = [...merged.values()].map(x => x.e).sort((a, b) => cmp(a.block, b.block));
    const moves = [];
    for (const { e, r } of merged.values()) { const row = r.rows.get(e.block); if (row && row.takes && row.landed) moves.push([e.block, e.by, e.to, row.landedF || row.amount]); }
    const res = { to: toList, from: fromList, draws: drawsOut, moves, toOwners: toList.map(x => x.owner), fromOwners: fromList.map(x => x.owner) };
    toComeMemo.set(key, res);
    return res;
  };
  // what is owed as a block sees it, and once every hand-over held is read
  const toComeSeenBy = b => { const past = pool.past(b.hash); return toComeRead(h => past.has(h), 'seen ' + b.hash); };
  const toComeLatest = () => toComeRead(() => true, 'latest');
  // ---- settling: counted blocks made for P
  // the deal's schema is the bound offer's own (promises.md: once a counter binds, the deal's terms are the counter's own, whole)
  const schema = live.refs.schema && pool.get(live.refs.schema);
  // a block confirms or defeats only if its author is named: an id (a role name is gone with roles)
  // a confirmer is one the deal's schema names in its grounds; no caller adds one (a stage is a function of the blocks alone)
  // a side of the deal, or a role inside a side's circle, is never its confirmer or its referee (invariant 13): such a name adds nothing
  const openName = sideOfB(Q) === 'from' ? 'to' : 'from';
  const receiverAtTie = k => { const r = sideAt(k, accept); return isStr(r) ? r : k === openName ? ((takers[0] && isStr(takers[0].who) && takers[0].who) || accept.refs.author) : undefined; };
  const dealSides = ['from', 'to'].map(receiverAtTie).filter(isStr);
  holdersFn = () => (toComeActive ? [...new Set([...toComeLatest().toOwners, ...toComeLatest().fromOwners])] : []);
  const bench = benchOf(schema, dealSides, accept);
  out.bench = bench.names.length ? { names: bench.names, needed: bench.needed, wait: bench.wait, clocks: bench.clocks } : 'none';
  out.referee_ties = bench.ties(['from', 'to'].map(k => [k, receiverAtTie(k)]));
  const namedBy = c => bench.named(c);
  const confirmed = h => pool.all().some(c => asList(c.refs.confirms).includes(h) && namedBy(c));
  // the deal's referee: as many of the bench's names as are needed (promises.md, Disputes). Its word is the last: a block they defeat counts for
  // nothing unless each changed its ruling; one they confirm counts whatever a side says of it. true, false, or null when they have not spoken.
  const ruling = h => bench.ruling(h);
  // a receiver's accept of a transfer counts unless the giver withdrew the transfer first or, on one that carried expires, declined the accept; an
  // answer the referee defeats counts for nothing
  // standingAnswer(b, byReceiver): the accepted answers to b that stand (folds.md): from the receiving side, and the giver did not withdraw a transfer
  // first (answerStands) nor the referee defeat the answer
  const standingAnswer = (b, byReceiver = () => true) => D.filter(a => a.refs.answers === b.hash && a.state.status === 'accepted' && byReceiver(a) &&
    (b.type !== 'transfer' || answerStands(b, a, pool)) && ruling(a.hash) !== false);
  const accepted = (b, receiver) => standingAnswer(b, a => receiver === undefined || who(a) === receiver).length > 0;
  // only the deal's referee changes what counts (folds.md, Defeated blocks): a side's defeats erases nothing; the stage shows it as disputed
  const defeated = h => ruling(h) === false;
  const partSide = b => sideOfB(b); // 1.9 stage 5 (section 8): `pass` is gone: a block counts for the side it speaks for
  const settling = D.filter(b => !defeated(b.hash) && b.refs.answers === undefined && b.hash !== P.hash && b.type !== 'promise' && asList(b.refs.for).includes(P.hash) && partSide(b));
  // who a side is where a block stands; an open side is the taker, or the accepter
  const otherName = sideOfB(Q) === 'from' ? 'to' : 'from';
  const receiverAt = (side, b) => { const r = sideAt(side, b); if (isStr(r)) return r; return side === otherName ? ((takers[0] && isStr(takers[0].who) && takers[0].who) || accept.refs.author) : undefined; };
  // a transfer to a side counts once that side answers it accepted (the side read where its answer stands), or a named confirmer confirms it
  // who may answer b for the right of a side: once what is owed has been handed over, the owner of that right where b stands; else the side where the answer stands
  const rcvs = (side, b, a, rights) => {
    if (rights && toComeActive) {
      const o = toComeSeenBy(b), owners = side === 'to' ? o.toOwners : o.fromOwners;
      if (owners.length) return owners;
    }
    const r = receiverAt(side, a);
    return isStr(r) ? [r] : [];
  };
  const answersTo = (b, side, rights) => standingAnswer(b, a => rcvs(side, b, a, rights).some(r => who(a) === r && asList(b.refs.to_owner).includes(r)));
  const countedTo = (b, side, rights) => answersTo(b, side, rights).length > 0 || receivedAbout(b, side).length > 0 || (rcvs(side, b, b, rights).some(r => asList(b.refs.to_owner).includes(r)) && confirmed(b.hash));
  // a transfer that names an instance moves toward a line only as a draw on it that lands, of the line's what (the thing itself, or one whose refs.of names it)
  // (folds.md, What is left, The other side)
  const ofLine = (h, what) => { const t = pool.get(h), whats = asList(what); return !!t && t.type === 'thing' && (whats.includes(h) || asList(t.refs.of).some(k => whats.includes(k))); };
  const landedDrew = (b, h) => {
    const r = ownershipFold(h, pool);
    if (r.not_shown) notShown(r);
    const e = r.draws.find(x => x.block === b.hash && x.takes && x.state === 'landed');
    if (!e) return null;
    return { took: e.took, whole: !r.stated, unit: r.stated ? r.stated.unit : null, of: r.kind ? r.kind.of : null };
  };
  // DECIDED (03-amounts, What building changed): [S3-29] "read as a transfer that names no instance" (folds.md, One whole) is read for the stage: it counts toward its line or price in its own kind on the receiver's accept, and not as a draw
  // a transfer that draws an amount on an instance that states no pack takes nothing there (no_measure), and is read as a transfer that names no instance (folds.md, One whole)
  const asNone = b => isAmount(b.state.amount) && asList(b.refs.what).length > 0 && asList(b.refs.what).every(h => { const r = ownershipFold(h, pool); if (r.not_shown) notShown(r); const e = r.draws.find(x => x.block === b.hash); return !!e && !e.takes && e.why === 'no_measure'; });
  const receivedAbout = (b, side) => D.filter(r => r.type === 'observe' && r.state.kind === 'received' && asList(r.refs.answers).includes(b.hash) && isAmount(r.state.amount) && sideOfB(r) === side && !defeated(r.hash) && binds(r, pool));
  // 1.9 3e-3 (D4): her order, where it is in the block's causal past and states that it is her word that the goods are in her hand (`terms.in_hand: true`), counts the block toward what moves to her. An order that does not say so counts nothing toward what came. No order counts toward a price.
  // 1.9-GUESS [3e-3]: "for no more than it states" is read as the block's own stated amount (the order's quantity does not cap it); a block of the deal's other side that has the order in its causal past counts at its own amount
  const orderInHand = b => D.some(o => o.type === 'promise' && o.state.status === undefined && o.refs.answers === undefined && termsOf(o).in_hand === true && sideOfB(o) === 'to' && o.hash !== b.hash && pool.sees(b.hash, o.hash));
  const goods = [], pays = [], refunds = [], works = [], unanswered = [], receivedFrom = [], receivedTo = [], attempts = [];
  // a block of the deal whose every accepted answer the bench defeated counts for nothing in the stage (only the bench changes what counts); a draw that landed stays landed (ownership is the draw's own causal past)
  const answersDefeated = b => { const ans = D.filter(a => a.refs.answers === b.hash && a.state.status === 'accepted'); return ans.length > 0 && ans.every(a => ruling(a.hash) === false); };
  const quantityKind = isAmount(terms.quantity) ? kindOf(terms.quantity) : null;
  // the kinds of the lines (each line's quantity, or the deal's chosen quantity): a transfer that names none counts toward a line only in its kind
  const lineKinds = Array.isArray(terms.lines) ? terms.lines.filter(l => isObj(l) && isAmount(l.quantity)).map(l => kindOf(l.quantity)) : [chosen].filter(isAmount).map(kindOf);
  // DECIDED (03-amounts, What building changed): [S3-20] a promise that names no `what` and no lines (a loan of money) moves its `terms.quantity`: the fold reads it as one line, id null, so `lines`, `moved` and `underway` work as for goods
  // a pseudo-line: a promise that names no `what` and no lines moves its quantity, an amount (a loan of money, folds.md A promise's stage, stage 2)
  const noWhat = !(Array.isArray(terms.lines) && terms.lines.length) && (live.refs.what !== undefined ? live.refs.what : Q.refs.what) === undefined && Q.state.what === undefined;
  for (const b of settling) {
    if (b.type === 'transfer') {
      // a payment for several promises pays each only by its split: with none, it pays none of them (things.md, Transfers)
      if (asList(b.refs.for).length > 1 && !Array.isArray(b.state.split)) continue;
      const side = sideOfB(b), names = asList(b.refs.what).length > 0 && !asNone(b), amt = isAmount(b.state.amount) ? b.state.amount : null;
      if (!names && !amt) continue;
      if (side === 'to') {
        // a payment speaks for the paying side (to) and goes to the from side; no one pays by another's hand (folds.md, stage 1)
        attempts.push(b);
        // 1.9 3e-1: or by the very thing named: a draw on the instance the price's `of` names that lands (her yes may be the deal's own first promise)
        const priceOf = isObj(terms.price) ? (isStr(terms.price.of) ? terms.price.of : isObj(terms.price.amount) && isStr(terms.price.amount.of) ? terms.price.amount.of : null) : null;
        if (countedTo(b, 'from', true) || (names && priceOf !== null && asList(b.refs.what).includes(priceOf) && (() => { const r = landedDrew(b, priceOf); return !!r && !r.whole; })())) pays.push(b); else if (!names) unanswered.push(b.hash);
      } else if (side === 'from') {
        // DECIDED (03-amounts, What building changed): [S3-23] a transfer from the delivering side in the price's kind is a transfer back only where the line's kind is another; in a deal that moves and is paid in one kind (a loan) it is a delivery
        // a transfer back is in the price's kind and is not the line's own kind; any other from-side transfer is a delivery
        const back = !names && amt && kindP && sameKind(amt, kindP) && !(quantityKind && sameKind(quantityKind, kindP)) && !(Array.isArray(terms.lines) && terms.lines.some(l => isAmount(l.quantity) && sameKind(l.quantity, amt)));
        if (back) { if (countedTo(b, 'to', false)) refunds.push(b); else unanswered.push(b.hash); continue; }
        if (names) {
          // an open receiver (an allocation's deal: state.count, no to_owner) on the offerer's word alone (folds.md, stage 2)
          const counted = b.state.count !== undefined && b.refs.to_owner === undefined && Q.refs.to === undefined && sideOfB(Q) === 'from' && counts(b, pool);
          // one that names an instance counts toward a line only as a draw on it that lands (folds.md, What is left, The other side)
          // the receiving side is read where the delivery stands, or (Bearer, promises.md) where the receiving answer stands: a note's holder there who accepts it
          // (end pass 2026-11-20, as the core reads it: "what is to come goes to whoever holds the note where the receiving answer stands")
          const toReceiver = asList(b.refs.to_owner).some(r => rcvs('to', b, b, true).includes(r)) || standingAnswer(b, a => asList(b.refs.to_owner).includes(who(a)) && rcvs('to', b, a, true).includes(who(a))).length > 0;
          if (!answersDefeated(b) && (counted || (toReceiver && asList(b.refs.what).some(h => landedDrew(b, h))))) goods.push(b);
        } else if (!lineKinds.some(k => sameKind(amt, k))) continue; // a transfer that names none moves something toward a line only in that line's kind
        else if (countedTo(b, 'to', true) || orderInHand(b)) goods.push(b); else unanswered.push(b.hash);
      }
    } else if (b.type === 'observe' && b.state.kind === 'work') {
      // 1.9-GUESS [5-23] R-P7 (D13; 07 R20, R21): a `work` is its doer's word, in her own name. It counts toward what moves where the job's terms name whose word counts it (`terms.condition`, a `signal` of that kind `by` those named); where the job names no one, where the side the work goes to answers it `accepted`.
      const receiver = sideAt(partSide(b) === 'from' ? 'to' : 'from', b);
      const wc = isObj(terms.condition) && terms.condition.signal === 'work' && Array.isArray(terms.condition.by) ? terms.condition : null;
      if (wc) { if (wc.by.includes(who(b)) && partSide(b) === 'from') works.push(b); }
      else if (toComeActive ? standingAnswer(b, a => rcvs('to', b, a, true).includes(who(a))).length > 0 : accepted(b, receiver)) works.push(b);
      else if (confirmed(b.hash)) works.push(b);
    } else if (b.type === 'observe' && b.state.kind === 'received') {
      // DECIDED (03-amounts, What building changed): [S3-26] a `received` word is read for the side that signs it: the payee's toward the price, the other side's toward the line its `state.line` names (the only line when it names none); the
      // signal of a signer her account word names (`state.by`) is stage 5's and is not built
      // a receiver with nothing to answer says what came, her word against herself, added as an accepted transfer is (folds.md, What is left, The other side)
      if (!isAmount(b.state.amount)) continue;
      const side = sideOfB(b);
      if (side === 'from') receivedFrom.push(b); else if (side === 'to') receivedTo.push(b);
    } else if (b.type === 'transform') {
      if (accepted(b) || confirmed(b.hash)) goods.push(b);
    }
  }
  // 1.9 3e-8: a `received` by a signer her account word names in `by` counts toward her price only where it names that account word (in `refs.derives_from`) and the place (`state.destination`); the word is the payee's, and her head where the received is signed.
  // A pointer to a word that is not the payee's, or is not her head there, or to a place that word does not list, names no place and counts nothing.
  {
    const payee = receiverAt('from', accept);
    if (isStr(payee) && kindP !== undefined) for (const r of D) {
      if (r.type !== 'observe' || r.state.kind !== 'received' || !asList(r.refs.for).includes(P.hash) || !isAmount(r.state.amount) || r.refs.author === payee || !binds(r, pool) || defeated(r.hash)) continue;
      const past = pool.past(r.hash), heads = accountHeads(payee, pool, past);
      const aw = asList(r.refs.derives_from).map(h => pool.get(h)).find(x => x && x.type === 'observe' && x.state.kind === 'account' && (x.refs.author === payee || x.refs.as === payee));
      if (!aw || heads.length !== 1 || heads[0] !== aw || !destinationsOk(aw.state.destinations)) continue;
      // 1.9-GUESS [3e-8]: `by` names the signer by the id of the person who signs the received (its author)
      if (!isStr(r.state.destination) || !aw.state.destinations.some(x => x.destination === r.state.destination && x.by === r.refs.author)) continue;
      receivedFrom.push(r);
    }
  }
  // ---- the other side: a plain sum, in its own kind, of what the receiver accepted, or of what her accepted answer says it covers where that is more (of several answers, the
  // one that says most). A payment that names an instance counts toward a price only where the price states an `of` and the instance's refs.of is that id.
  const coversIn = (b, side, kind) => answersTo(b, side, side === 'from').map(a => a.state.covers).filter(c => isAmount(c) && unitOf(c, kind)).reduce((mx, c) => fmax(mx, dec(c.value)), F0);
  // DECIDED (03-amounts, What building changed): [S3-25] a payment that names an instance counts its landed draw's amount toward a price only where the price states an `of` that is the instance's refs.of and the units agree; otherwise only
  // what the payee's answer says it covers (the largest of several); a payment with a `split` counts as its parts for this deal say
  // one payment counts once, at the most its receiving side has said of it (folds.md, What is left, The other side): of her counted accepted
  // answers to a transfer that names no instance, each says its amount, or the state.amount it states in that kind (no more than the transfer's);
  // the one that says most counts. With none (a signer she named counted it), the transfer's own amount.
  // 1.9 3e-2: the words of one side about one block count once, at the most any of them says: her own words, and each word of a tool that speaks for her. A `received` that `answers` a transfer is a word about that transfer; one that answers none is a payment of its own.
  const unitOf = (a, kind) => isAmount(a) && a.unit === kind.unit; // 1.9 3e-1: in that half's `unit`; no fold compares `of`
  const saidIn = (b, side, kind) => {
    kind = kind || (isAmount(b.state.amount) ? kindOf(b.state.amount) : null);
    const own = isAmount(b.state.amount) ? dec(b.state.amount.value) : null;
    let best = F0;
    const words = answersTo(b, side, true);
    // counted by a named confirmer, or by her order in hand (3e-3): no word of hers says less, so the block's own amount in the unit
    if (!words.length && !receivedAbout(b, side).length) return own !== null && unitOf(b.state.amount, kind) ? own : F0;
    for (const a of words) {
      const st = a.state.amount;
      const said = isAmount(st) && unitOf(st, kind) && (own === null || fcmp(dec(st.value), own) <= 0) ? dec(st.value) : (own !== null && unitOf(b.state.amount, kind) ? own : F0);
      best = fmax(best, said);
    }
    for (const r of receivedAbout(b, side)) if (unitOf(r.state.amount, kind)) best = fmax(best, dec(r.state.amount.value));
    return best;
  };
  const ownIn = (b, kind, side = 'from') => {
    if (Array.isArray(b.state.split)) return b.state.split.filter(x => isObj(x) && x.for === P.hash && isAmount(x.amount) && unitOf(x.amount, kind)).reduce((s, x) => fadd(s, dec(x.amount.value)), F0);
    if (asList(b.refs.what).length && !asNone(b)) {
      let f = F0;
      for (const h of asList(b.refs.what)) {
        if (h !== kind.of || kind.of === null || kind.of === undefined) continue;
        if (!pool.get(h)) notShown({ lacks: [h] });
        const rec = landedDrew(b, h);
        if (rec && !rec.whole && rec.unit === kind.unit) f = fadd(f, rec.took);
      }
      if (fpos(f)) return f;
    }
    // her word: her accepted answer at the block's amount or the state.amount she states (no more than the block's where it states one), in that unit
    return saidIn(b, side, kind);
  };
  const towardIn = (b, side, kind) => (Array.isArray(b.state.split) ? ownIn(b, kind, side) : fmax(ownIn(b, kind, side), coversIn(b, side, kind)));
  // the kind the promise is paid in: the price's; with no price, the one kind every counted payment covers (several: none)
  const kindsOfPay = b => {
    if (Array.isArray(b.state.split)) { const x = b.state.split.find(y => isObj(y) && y.for === P.hash && isAmount(y.amount)); return x ? [kindOf(x.amount)] : []; }
    const cs = answersTo(b, 'from', true).map(a => a.state.covers).filter(isAmount);
    if (cs.length) return cs.map(kindOf);
    return isAmount(b.state.amount) ? [kindOf(b.state.amount)] : [];
  };
  if (!kindP) {
    const ks = [...new Map(pays.flatMap(kindsOfPay).map(k => [jcs(k), k])).values()];
    if (ks.length === 1) kindP = ks[0];
  }
  const sentF = kindP ? pays.reduce((s, b) => fadd(s, ownIn(b, kindP)), F0) : F0;
  // a part of the price handed to the one who owes it is paid, with no money moved
  const payer = receiverAt('to', accept);
  const setoffF = toComeActive && isStr(payer) && kindP && !fixing ? (toComeLatest().from.filter(x => x.owner === payer).reduce((s, x) => fadd(s, x.f), F0)) : F0;
  const setoff = fpos(setoffF);
  const receivedPaid = kindP ? receivedFrom.reduce((s, b) => (unitOf(b.state.amount, kindP) ? fadd(s, dec(b.state.amount.value)) : s), F0) : F0;
  // the seller's `covers` on his spot-exchange transfer is the payee's word that this much of the price came: it counts at what he said, in the price's unit
  const spotCoversF = spotAccept && kindP && isAmount(spotAccept.state.covers) && unitOf(spotAccept.state.covers, kindP) ? dec(spotAccept.state.covers.value) : null;
  const paidF = kindP ? fadd(fadd(fadd(pays.reduce((s, b) => fadd(s, towardIn(b, 'from', kindP)), F0), setoffF), receivedPaid), spotCoversF === null ? F0 : spotCoversF) : F0;
  const refundedF = kindP ? refunds.reduce((s, b) => fadd(s, towardIn(b, 'to', kindP)), F0) : F0;
  // 1.9 3e-1 (decided in building, 2026-11-19): a block that counts nothing toward the price is as if it were not there: `paid` stays null until a block counts (a payment the payee has not answered pays nothing)
  if ((pays.length || setoff || receivedFrom.length || spotCoversF !== null) && kindP) out.paid = amtOut(paidF, kindP);
  // R-P7: on a deal priced per unit of work, a payment `for` it counts the work its doer stated in the payment's causal past, oldest first, at the price per unit (so a doer's word that nobody answered is counted by the payer's own payment)
  const workDeal = (live.refs.what !== undefined ? live.refs.what : Q.refs.what) === undefined && Q.state.what !== undefined;
  if (workDeal && perUnit(terms.price) && isObj(terms.price.amount) && isObj(terms.price.per) && kindP && sameKind(terms.price.amount, kindP) && fpos(dec(terms.price.amount.value)) && pays.length) {
    const unit = terms.price.per.unit, a = dec(terms.price.amount.value), pv = dec(terms.price.per.value);
    let capacity = fdiv(fmul(paidF, pv), a);
    const pastOfPays = new Set(pays.flatMap(x => [...pool.past(x.hash)]));
    const doerWork = D.filter(o => o.type === 'observe' && o.state.kind === 'work' && isObj(o.state.amount) && o.state.amount.unit === unit && fpos(dec(o.state.amount.value)) && partSide(o) === 'from' && counts(o, pool) && !defeated(o.hash) && pastOfPays.has(o.hash))
      .sort((x, y) => (pool.past(x.hash).size - pool.past(y.hash).size) || cmp(x.hash, y.hash));
    for (const w of doerWork) {
      const amt = dec(w.state.amount.value);
      if (works.includes(w)) { capacity = fsub(capacity, fmin(amt, capacity)); continue; }
      const take = fmin(amt, capacity);
      if (fpos(take)) { works.push({ hash: w.hash, state: { amount: { value: fText(take), unit } } }); capacity = fsub(capacity, take); }
    }
  }
  // DECIDED (03-amounts, What building changed): [S3-27] `unanswered` lists the transfers of either side that name no instance, are `for` the deal and speak for a side, and that the other side has not accepted (nor a named confirmer confirmed)
  // 1.9 3e-2 with 3e-8 (stage 5 compare): a block that a `received` the payee's account word names answers is answered
  out.unanswered = [...new Set(unanswered)].filter(h => !receivedFrom.some(r => asList(r.refs.answers).includes(h))).sort();
  // what moves (promises.md): the offer's own refs.what, else the first promise's (a counter need not name it again)
  const whatRef = live.refs.what !== undefined ? live.refs.what : Q.refs.what;
  // lines: how much of each line the counted transfers moved
  const lineSpecs = Array.isArray(terms.lines) ? terms.lines.map(l => ({ id: l.id, what: l.what, quantity: isAmount(l.quantity) ? l.quantity : null, kind: isAmount(l.quantity) ? kindOf(l.quantity) : null, exact: isAmount(l.quantity) ? dec(l.quantity.value) : null, per: isObj(l.price) && perUnit(l.price) })) :
    (whatRef !== undefined ? [{ id: null, what: whatRef, quantity: chosen || (isAmount(terms.quantity) ? terms.quantity : null), kind: chosen ? kindOf(chosen) : (isAmount(terms.quantity) ? kindOf(terms.quantity) : null),
      exact: chosen ? dec(chosen.value) : (isAmount(terms.quantity) ? dec(terms.quantity.value) : null), per: isObj(terms.price) && perUnit(terms.price) }] :
      noWhat && isAmount(terms.quantity) ? [{ id: null, what: null, quantity: terms.quantity, kind: kindOf(terms.quantity), exact: dec(terms.quantity.value), per: isObj(terms.price) && perUnit(terms.price) }] : []);
  // catch weight (promises.md, Terms): under a per-unit price, terms.band is how far what is delivered may fall from the quantity chosen, either way, as
  // a fraction of it. What the receiver accepted inside the band covers the line and is what is priced; outside it the quantity chosen is priced, and
  // less than the band's bottom does not cover the line.
  const band = isStr(terms.band) && dec(terms.band) ? frac(terms.band) : null;
  const isWork = whatRef === undefined && Q.state.what !== undefined;
  const lineInfo = [];
  for (const l of lineSpecs) {
    // how much counted transfers moved, exactly, in the line's kind: a draw that landed, of the line's what, or an amount that names none; a whole instance (no pack) covers the line
    let whole = false, any = false, exact = F0;
    for (const t of goods) {
      if (t.type !== 'transfer') continue;
      if (l.id !== null && t.state.line !== l.id) continue;
      if (asList(t.refs.what).length && !asNone(t)) {
        for (const h of asList(t.refs.what)) {
          if (l.what === null || !ofLine(h, l.what)) continue;
          if (t.refs.to_owner === undefined) { // an open receiver: counted on the offerer's word
            const inst = pool.get(h), pk = inst && isAmount(inst.state.pack) ? inst.state.pack : null;
            any = true; if (!pk) whole = true; else if (l.kind && pk.unit === l.kind.unit) exact = fadd(exact, dec(pk.value));
            continue;
          }
          const rec = landedDrew(t, h);
          if (!rec) continue;
          any = true;
          if (rec.whole) whole = true; else if (l.kind && rec.unit === l.kind.unit && (l.kind.of === null || rec.of === l.kind.of)) exact = fadd(exact, rec.took);
        }
      } else if (isAmount(t.state.amount) && l.kind && sameKind(t.state.amount, l.kind)) { any = true; exact = fadd(exact, saidIn(t, 'to')); }
    }
    for (const b of receivedTo) if (b.state.line === undefined ? l.id === null || lineSpecs.length === 1 : b.state.line === l.id) if (l.kind && sameKind(b.state.amount, l.kind)) { any = true; exact = fadd(exact, dec(b.state.amount.value)); }
    for (const t of goods) if (t.type === 'transform') { any = true; whole = true; }
    let least = l.exact, inside = null;
    if (band && l.per && l.exact !== null && !whole) {
      const lo = fmul(l.exact, { n: band.d - band.n, d: band.d }), hi = fmul(l.exact, { n: band.d + band.n, d: band.d });
      least = lo;
      if (fcmp(exact, lo) >= 0 && fcmp(exact, hi) <= 0) inside = exact;
    }
    const coveredLine = l.exact === null ? any : (whole || fcmp(exact, least) >= 0);
    // capped at what is needed only when a whole instance covers the line; a line with no quantity needs one counted transfer of its thing
    // (promises.md, Settling): how much it moved is then not a number
    // DECIDED (03-amounts, What building changed): [S3-21] `lines[].needed` and `moved` are amounts in the line's kind (folds.md says "a sum in the line's kind"); null where the line states no quantity
    const movedAmt = l.kind === null ? null : l.exact === null ? null : whole ? { ...l.quantity } : amtOut(exact, l.kind);
    out.lines.push({ id: l.id, needed: l.quantity ? { ...l.quantity } : null, moved: movedAmt, any, coveredLine, inside });
    lineInfo.push({ whole, any, exact, least, coveredLine });
  }
  // inside a band, a line is priced on what moved (an exact decimal: every denominator here is a power of ten)
  const insides = out.lines.map(x => x.inside);
  if (insides.some(x => x)) {
    const qtyFor = (i, q) => (insides[i] && isAmount(q) ? { ...q, value: fText(insides[i]) } : q);
    const parts2 = pricedParts(terms, chosen, qtyFor);
    const r2 = computable && parts2.length && parts2.every(x => x !== null) ? stepUp(sumParts(parts2), terms.step) : null;
    if (r2) { totalF = r2.f; kindP = r2.kind; total = amtOut(totalF, kindP); out.total = total; }
  }
  let covered = false;
  if (lineSpecs.length) covered = out.lines.every(l => l.coveredLine);
  else if (isWork) {
    // accepted work covers the quantity accepted (not the offer's range); one accepted work block is enough when none was chosen (folds.md, stage 2)
    if (chosen) covered = fcmp(fsum(works.filter(w => w.state.amount && w.state.amount.unit === chosen.unit).map(w => w.state.amount.value)), frac(chosen.value)) >= 0;
    else covered = works.length > 0;
  }
  // a job states no instance: its one line is the work that counted, in the unit of what was chosen or the price per unit
  if (isWork && !lineSpecs.length) {
    const wunit = chosen ? chosen.unit : isObj(terms.price) && isObj(terms.price.per) ? terms.price.per.unit : null;
    if (wunit !== null) out.lines.push({ id: null, needed: chosen ? { ...chosen } : null, moved: amtOut(fsum(works.filter(w => isObj(w.state.amount) && w.state.amount.unit === wunit).map(w => w.state.amount.value)), { unit: wunit }) });
  }
  out.lines = out.lines.map(({ id, needed, moved }) => ({ id, needed, moved }));
  // ---- uncovered, for each side (folds.md, What each fold returns): what that side sent for the deal that counted, less what came back to her, less what the other half
  // covered, in its own kind, less the forfeit where it is kept
  const toUncovered = () => {
    if (!kindP || !fpos(fadd(sentF, receivedPaid))) return null;
    let value = F0;
    {
      if (lineSpecs.length) {
        lineSpecs.forEach((l, i) => {
          const info = lineInfo[i];
          const lineTerms = Array.isArray(terms.lines) ? terms.lines[i] : { price: terms.price, quantity: chosen };
          if (!isObj(lineTerms.price) || l.what === undefined) return;
          const qty = insides[i] && isAmount(lineTerms.quantity) ? { ...lineTerms.quantity, value: fText(insides[i]) } : lineTerms.quantity;
          const full = totalOf(lineTerms.price, qty);
          if (full === null || !sameKind(full.kind, kindP)) return;
          if (info.whole || (info.any && l.exact === null)) value = fadd(value, full.f);
          else if (l.exact === null) value = fadd(value, F0);
          else if (fcmp(info.exact, info.least) >= 0) value = fadd(value, full.f);
          else if (l.per) { const part = totalOf(lineTerms.price, { ...lineTerms.quantity, value: fText(info.exact) }); if (part !== null) value = fadd(value, part.f); }
          else {
            // a flat price for a whole: nothing is covered until the whole moves, except what the payer's own accepted answer to a delivery says it covers
            // (promises.md, Settling): her word lowers only what she is owed back
            let said = F0;
            for (const t of goods) {
              if (t.type !== 'transfer') continue;
              if (l.id !== null && t.state.line !== l.id) continue;
              if (!asList(t.refs.what).some(h => ofLine(h, l.what) && landedDrew(t, h))) continue;
              said = fadd(said, coversIn(t, 'to', kindP));
            }
            value = fadd(value, fmin(said, full.f));
          }
        });
      } else if (isObj(terms.price) && perUnit(terms.price)) {
        // a job or time promise at a price per unit: the accepted work, in that unit
        const unit = terms.price.per.unit;
        const worked = fsum(works.filter(w => isObj(w.state.amount) && w.state.amount.unit === unit).map(w => w.state.amount.value));
        const part = totalOf(terms.price, { ...terms.price.per, value: fText(worked) });
        if (part !== null && sameKind(part.kind, kindP)) value = fadd(value, part.f);
      } else {
        const workDone = chosen ? fcmp(fsum(works.filter(w => w.state.amount && w.state.amount.unit === chosen.unit).map(w => w.state.amount.value)), frac(chosen.value)) >= 0 : works.length > 0;
        if (workDone && totalF && sameKind(totalR ? totalR.kind : kindP, kindP)) value = fadd(value, totalF);
      }
    }
    // 1.9-GUESS [5-24] R-P9 (D14; 03 R9): `forfeit` stays with the payee only where an onward stop that speaks for the paying side is among the first onward stops of the deal and none that speaks for the payee is; in every other ending it is the payer's still
    const firstStops = earliest(onward, pool), keptByStops = firstStops.some(x => sideOfB(x) === 'to') && !firstStops.some(x => sideOfB(x) === 'from');
    const kept = keptByStops && isObj(terms.forfeit) && sameKind(terms.forfeit, kindP) && isStr(terms.forfeit.value) ? dec(terms.forfeit.value) : F0;
    let left = fsub(fsub(fsub(fadd(sentF, receivedPaid), refundedF), value), kept); // her own received word counts what came, as an accepted payment does
    if (!fpos(left)) left = F0;
    return amtOut(left, kindP);
  };
  // the delivering side: what moved to the other side, less what the payments covered (under a per-unit price, what was paid over the price per unit; on a flat price, all of
  // it once the price is paid in full, else nothing). One entry for each line that moved something, in the line's kind.
  const fromUncovered = () => {
    const outList = [];
    let free = paidF; // payments that name no line cover the lines in the order the terms list them
    lineSpecs.forEach((l, i) => {
      const info = lineInfo[i];
      if (!l.kind || !(info.any || fpos(info.exact))) return;
      const movedF = info.whole ? (l.exact || F0) : info.exact;
      if (!fpos(movedF)) return;
      const lineTerms = Array.isArray(terms.lines) ? terms.lines[i] : { price: terms.price, quantity: chosen };
      let coveredF = F0;
      const priced = lineTerms && isObj(lineTerms.price) ? totalOf(lineTerms.price, { ...(isAmount(lineTerms.quantity) ? lineTerms.quantity : { unit: l.kind.unit }), value: fText(movedF) }) : null;
      if (priced && kindP && sameKind(priced.kind, kindP)) {
        const labelled = pays.reduce((s, b) => fadd(s, Array.isArray(b.state.split) ? b.state.split.filter(x => isObj(x) && x.for === P.hash && x.line === l.id && isAmount(x.amount) && sameKind(x.amount, kindP)).reduce((t, x) => fadd(t, dec(x.amount.value)), F0) : F0), F0);
        const share = fmin(free, fsub(priced.f, labelled).n > 0n ? fsub(priced.f, labelled) : F0);
        const paidL = fadd(labelled, share);
        free = fsub(free, share);
        if (l.per && isObj(lineTerms.price.amount)) {
          // 1.9 3e-6: under a price { amount: a, per: p } the pieces the payments pay for are P times p over a, exact, in `per`'s unit, and they are taken only from what moved in that same unit; under a price of zero, all that moved is paid for
          const a = dec(lineTerms.price.amount.value), pv = dec(lineTerms.price.per.value);
          if (l.kind.unit !== lineTerms.price.per.unit) coveredF = F0;
          else if (a.n === 0n) coveredF = movedF;
          else coveredF = fmin(movedF, fdiv(fmul(paidL, pv), a));
        } else coveredF = fcmp(paidL, priced.f) >= 0 && info.coveredLine ? movedF : F0; // a flat price: once the whole moved and it is paid in full
      }
      let left = fsub(movedF, coveredF);
      if (!fpos(left)) left = F0;
      outList.push({ line: l.id, amount: amtOut(left, l.kind) });
    });
    return outList;
  };
  // DECIDED (03-amounts, What building changed): [S3-22] `uncovered.from` has one entry for each line that moved something (its amount may be 0); payments with no line label cover the lines in the order the terms list them; before a binding
  // accept it is { from: [], to: null }
  out.uncovered = { from: fromUncovered(), to: toUncovered() };
  const uncoveredFact = () => out.uncovered;
  // what is owed, and by the hand-overs of it (promises.md, Owed): null until one is held
  if (toComeActive) {
    const o = toComeLatest();
    out.to_come = { to: o.to.map(x => ({ owner: x.owner, amount: x.amount })), from: o.from.map(x => ({ owner: x.owner, amount: x.amount })), draws: o.draws };
    // a payment made to an owner who had already handed that part of what is owed on, without seeing it, counts; the old owner holds that amount for
    // the new one: [{ from, to, amount, payment }]
    const toComeOn = [];
    for (const x of pays) {
      const owners = toComeSeenBy(x).fromOwners;
      const owner = asList(x.refs.to_owner).find(w => owners.includes(w));
      if (owner === undefined || !isAmount(x.state.amount)) continue;
      const kind = kindOf(x.state.amount);
      let left = Array.isArray(x.state.split) ? x.state.split.filter(e => isObj(e) && e.for === P.hash && isAmount(e.amount) && sameKind(e.amount, kind)).reduce((t, e) => fadd(t, dec(e.amount.value)), F0) : dec(x.state.amount.value);
      for (const [th, from, to, f] of o.moves) {
        if (from !== owner || pool.sees(x.hash, th)) continue;
        const held = fmin(left, f);
        if (fpos(held)) { toComeOn.push({ key: x.hash, to, v: { from: owner, to, amount: amtOut(held, kind), payment: x.hash } }); left = fsub(left, held); }
      }
    }
    out.to_come_on = toComeOn.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.to < b.to ? -1 : a.to > b.to ? 1 : 0)).map(e => e.v);
  }
  // a message with a receipt (promises.md, Settling): each counted observe of kind message a side wrote for the deal, with the time the named clock received
  // it (the promise's clocks and no one else's receipt); null while there is no clock or no receipt
  out.received_at = pool.all().filter(o => o.type === 'observe' && o.state.kind === 'message' && asList(o.refs.for).includes(P.hash) && counts(o, pool) && sideOfB(o)).sort(byHash).map(o => {
    const side = sideOfB(o), ks = clocksOf(terms.clocks);
    return { message: o.hash, side, at: ks ? (receivedAt(o.hash, ks, pool) || null) : null };
  });
  // a new date both sides signed (promises.md, Terms: pay_by): a side's observe of kind message for the deal with a pay_by, answered accepted by an
  // observe of the other side; the agreed dates in the order the answers stand in causal order (ties by hash)
  out.moved = [];
  {
    const found = [];
    for (const p of pool.all()) {
      if (!(p.type === 'observe' && p.state.kind === 'message' && asList(p.refs.for).includes(P.hash) && isStr(p.state.pay_by) && timeProblem(p.state.pay_by) === null && counts(p, pool))) continue;
      const side = sideOfB(p);
      if (!side) continue;
      for (const a of D) if (a.type === 'observe' && asList(a.refs.answers).includes(p.hash) && a.state.status === 'accepted' && sideOfB(a) && sideOfB(a) !== side) found.push({ n: pool.past(a.hash).size, h: a.hash, v: { pay_by: p.state.pay_by, proposal: p.hash, answer: a.hash } });
    }
    found.sort((x, y) => x.n - y.n || cmp(x.h, y.h));
    out.moved = found.map(f => f.v);
  }
  const overAllocated = !!alloc && takers[0] && takers[0].over_allocated === true;
  out.over_allocated = overAllocated;
  const paidAll = computable && (totalF === null || fcmp(paidF, totalF) >= 0);
  // due and paid_at are facts (folds.md): the deal's terms.pay_by, and once the price is paid in full the latest date among the payments, each dated
  // by the first counting answer of the side it is paid to (or a named confirmer's confirms). Lateness is each reader's judgement.
  // a standing promise is due and paid occurrence by occurrence (decision D16): its one pay_by and one occurrence's price are never read as the whole,
  // so it reports no due and no paid_at rather than mislead
  const standing = terms.repeat !== undefined;
  // a `when` that follows an event (promises.md, Relative time): after an observe kind that is not an id
  const wh = live.state.when, eventWhen = isObj(wh) && isStr(wh.after) && !RX.id.test(wh.after) && wh.wait !== undefined ? wh : null;
  out.due = isStr(terms.pay_by) && !standing ? terms.pay_by : null;
  const countedAt = b => { const rs = rcvs('from', b, b, true); const dates = [...answersTo(b, 'from', true), ...pool.all().filter(c => asList(c.refs.confirms).includes(b.hash) && namedBy(c) && counts(c, pool) && rs.some(r => asList(b.refs.to_owner).includes(r)))].map(x => x.state.at).filter(isStr).sort(); return dates[0]; };
  // a part of the price handed to the one who owes it is dated by the owner's accept of the hand-over
  const handedDates = setoff ? toComeLatest().moves.filter(m => m[2] === payer).map(m => pool.all().filter(a => a.type === 'transfer' && a.state.status === 'accepted' && asList(a.refs.answers).includes(m[0])).map(a => a.state.at).filter(isStr).sort()[0]).filter(isStr) : [];
  const payDates = [...pays.map(countedAt), ...handedDates].filter(isStr).sort();
  out.paid_at = !standing && paidAll && total !== null && (pays.length || setoff || receivedFrom.length) && fpos(paidF) && payDates.length ? payDates[payDates.length - 1] : null;
  // a payment names the occurrence it pays (state.occurrence: its start time, or the hash of the observe that started it; decision E4): occurrences
  // reports each one a payment names or an event started, when it fell due (a start time is its own due; an event's is its observe's at plus the
  // repeat's wait), what was paid for it, and once that covers one occurrence's price, the latest date among its payments
  out.occurrences = [];
  if (standing || eventWhen) {
    const rep = standing ? terms.repeat : eventWhen, wait = isObj(rep) && isStr(rep.wait) ? rep.wait : null, byList = isObj(rep) && Array.isArray(rep.by) ? rep.by.filter(isStr) : [];
    // an event `when` has no `by`: only the receiving side's ask counts
    const holderOnly = !standing;
    const events = isObj(rep) && isStr(rep.after) ? pool.all().filter(o => o.type === 'observe' && o.state.kind === rep.after && asList(o.refs.for).includes(P.hash) && counts(o, pool) &&
      (holderOnly ? sideOfB(o) === 'to' : (isObj(rep) && Array.isArray(rep.by) ?
        // the side that charges cannot start a charge alone: only the names in `by` start occurrences (a side counts only if it names itself); with no `by`, none starts one
        (byList.some(n => n === o.refs.author) || (o.refs.as !== undefined && byList.includes(o.refs.as))) : false))) : [];
    // the wait runs from the named clock's receipt of the event (blocks.md), never from its own `at`: the promise's clocks and no one else
    const kclock = clocksOf(terms.clocks);
    // the occurrences a payment names: a lone state.occurrence, or in a split the occurrence of each part for this deal (a part with none reads the payment's own)
    const occOf = b => (Array.isArray(b.state.split) ? b.state.split.filter(x => isObj(x) && x.for === P.hash).map(x => (isStr(x.occurrence) ? x.occurrence : b.state.occurrence)).filter(isStr) : isStr(b.state.occurrence) ? [b.state.occurrence] : []);
    const sumFor = (b, name) => (Array.isArray(b.state.split) ? b.state.split.filter(x => isObj(x) && x.for === P.hash && (isStr(x.occurrence) ? x.occurrence : b.state.occurrence) === name && isAmount(x.amount) && kindP && sameKind(x.amount, kindP)).reduce((t, x) => fadd(t, dec(x.amount.value)), F0) : kindP ? towardIn(b, 'from', kindP) : F0);
    // an occurrence kept with no price: the doer's own done made for the deal, naming it; the doer is the from side, or whoever it passed the part to
    const dones = pool.all().filter(o => o.type === 'observe' && o.state.kind === 'done' && isStr(o.state.occurrence) && asList(o.refs.for).includes(P.hash) && partSide(o) === 'from' && counts(o, pool) && !defeated(o.hash));
    const names = [...new Set([...pays.flatMap(occOf), ...events.map(o => o.hash), ...dones.map(o => o.state.occurrence)])].sort();
    for (const name of names) {
      const ev = events.find(o => o.hash === name);
      const rcv = ev && kclock ? receivedAt(ev.hash, kclock, pool) : null;
      const due = ev ? (isStr(rcv) ? (wait ? addDur(rcv, wait) : rcv) : null) : (timeProblem(name) === null && !RX.hash.test(name) ? name : null);
      const mine = pays.filter(b => occOf(b).includes(name));
      const sum = mine.reduce((t, b) => fadd(t, sumFor(b, name)), F0);
      const paid = !mine.length || !kindP ? null : amtOut(sum, kindP);
      const covered = totalF !== null && fcmp(sum, totalF) >= 0 && fpos(sum);
      const dates = covered ? mine.map(countedAt).filter(isStr).sort() : [];
      const doneDates = dones.filter(o => o.state.occurrence === name).map(o => o.state.at).filter(isStr).sort();
      out.occurrences.push({ occurrence: name, due: due === undefined ? null : due, paid, paid_at: dates.length ? dates[dates.length - 1] : null, done_at: doneDates.length ? doneDates[0] : null });
    }
  }
  // a side's defeats of the deal's head (its first promise, its root, or the offer the binding accept answers), or of a block in the deal that speaks
  // for the other side (a delivery, a payment, work), changes nothing: it is shown as disputed, by that side, on the date it gives (promises.md,
  // Disputes). A side's defeats of its own block is no dispute.
  const disputed = [];
  for (const c of pool.all()) {
    const by = counts(c, pool) ? sideOfB(c) : null;
    if (!by) continue;
    for (const h of asList(c.refs.defeats)) {
      const t = pool.get(h);
      if (!t) continue;
      const head = h === P.hash || h === Q.hash || h === live.hash;
      const tSide = sideOfB(t);
      if (head || (D.some(x => x.hash === h && x.hash !== P.hash) && tSide && tSide !== by)) disputed.push({ hash: c.hash, of: h, by, at: isStr(c.state.at) ? c.state.at : null });
    }
  }
  out.disputed = disputed.sort((a, b) => byHash(a, b) || cmp(a.of, b.of));
  Object.defineProperty(out, 'paidUp', { value: paidAll, enumerable: false }); // compared exactly; the view reads it, never the floats reported
  // which side ended it (folds.md, stage 4): the side the stop speaks for, or both when a counted block of the other side confirms the stop (a
  // later stop of their own is not agreement)
  const byOf = st => {
    const side = sideOfB(st), other = side === 'from' ? 'to' : 'from';
    if (side === null) return null;
    const agreed = pool.all().some(c => asList(c.refs.confirms).includes(st.hash) && counts(c, pool) && sideOfB(c) === other);
    return agreed ? 'both' : side;
  };
  // a standing promise (a repeat) is done occurrence by occurrence, never as a whole: underway until a stop or a close ends it (folds.md)
  if (terms.repeat !== undefined) covered = false;
  const anySettling = [...goods, ...pays, ...works].length > 0; // stage 5 compare (R-P5): the seller's transfer that binds the deal is his delivery too; where it lands it counts, and the deal is underway
  // ---- onward stop and occurrences
  const occ = new Set();
  for (const b of D) {
    if (!(b.type === 'promise' && b.state.status === 'stopped' && isObj(b.state.stop) && Array.isArray(b.state.stop.occurrences) && sideOfB(b))) continue;
    // a pause ends early by its own signer's updates of it, status resumed (promises.md, Answers): the times named at or after its at stand again
    const back = D.filter(r => r.type === 'promise' && r.state.status === 'resumed' && r.refs.updates === b.hash && r.refs.answers === undefined).map(r => Date.parse(r.state.at)).filter(t => !Number.isNaN(t));
    b.state.stop.occurrences.forEach(o => { const t = timeProblem(o) === null ? Date.parse(o) : NaN; if (!(back.some(r => r <= t))) occ.add(o); });
  }
  out.stopped = [...occ].sort();
  // the sides the binding terms say may show the deal (privacy.md, Showing a deal); a deal that says nothing has no `show`
  // ---- the stage: the first of these that holds, from the furthest along back to the start (with no binding accept, above)
  if (covered && paidAll && fpos(paidF) && fcmp(refundedF, paidF) >= 0) out.stage = 'reversed';
  else if (covered && paidAll) out.stage = 'done';
  else if (onwardFirst) {
    // of first stops that do not see each other, speaking for both sides, by is both: no hash decides it (folds.md, stage 4). A death ends no
    const firsts = earliest(onward, pool);
    const crossing = ['from', 'to'].every(sd => firsts.some(f => sideOfB(f) === sd));
    out.stage = 'stopped'; out.stop = 'onward'; out.from = onwardFirst.hash; out.by = crossing ? 'both' : byOf(onwardFirst);
    out.uncovered = uncoveredFact();
  }
  else {
    out.stage = anySettling ? 'underway' : 'accepted';
    if (overAllocated) out.uncovered = uncoveredFact();
  }
  return out;
}
// whether a stage says its deal binds: accepted or further along (underway, done, reversed, breached), or stopped onward (it bound, then a side
// stopped it); offered, asked, declined, stopped before, or no stage binds nothing
const stageBinds = s => !!s && (['accepted', 'underway', 'done', 'reversed'].includes(s.stage) || (s.stage === 'stopped' && s.stop === 'onward'));
function promiseView(first, blocks, opts) {
  const v = promiseViewBase(first, blocks, opts);
  if (!v) return v;
  // a stage this reader is not shown is a view not shown: no condition fact, no missed date (as the core gives it)
  if (v.not_shown) return { ...v, condition: null, condition_failed: null, missed: null };
  // the condition of the offer in force, as a fact beside the stage (promises.md, The condition fact): holds, not, unread, or null with none
  const pool = new Pool([first, ...poolOf(blocks).all()]), o = pool.get(v.offer) || first, c = termsOf(o).condition;
  let word = null;
  if (c !== undefined) { const h = conditionHolds(c, pool.all(), opts && opts.now !== undefined ? opts.now : ''); word = h === true ? 'holds' : h === false ? 'not' : 'unread'; }
  // failure spreads visibly (promises.md, The condition fact): a condition that does not hold because the deal it names ended without it (stopped,
  // declined, expired, breached) or itself rests on such a deal names that deal
  const failedOn = (cond, seen) => {
    const key = ['settled', 'paid', 'accepted'].find(k => isObj(cond) && isStr(cond[k]));
    if (!key) return null;
    const target = cond[key];
    if (seen.includes(target) || !pool.get(target)) return null;
    seen.push(target);
    const tv = promiseViewBase(pool.get(target), pool.all(), opts);
    if (!tv) return null;
    const ended = ['declined', 'expired'].includes(tv.stage) || (tv.stage === 'stopped' && (tv.stop === 'before' || key !== 'accepted'));
    if (ended) return target;
    const to = pool.get(tv.offer) || pool.get(target), tc = to ? termsOf(to).condition : undefined;
    if (tc !== undefined && conditionHolds(tc, pool.all(), opts && opts.now !== undefined ? opts.now : '') === false && failedOn(tc, seen) !== null) return target;
    return null;
  };
  // which date was missed (promises.md, Terms: pay_by): the dates in force in the order agreed (the first promise's own pay_by, then each date both sides
  // signed) that passed before the price was paid in full, or, while it is unpaid, before the reader's clock; null when it states no pay_by or is standing
  const tt = termsOf(o);
  let missed = null;
  if (isStr(tt.pay_by) && tt.repeat === undefined) {
    const dates = [tt.pay_by, ...(v.moved || []).map(m => m.pay_by)];
    const horizon = isStr(v.paid_at) ? v.paid_at : (opts && isStr(opts.now) && opts.now !== '' ? opts.now : null);
    missed = dates.filter(d => horizon !== null && d < horizon);
  }
  const out = { ...v, condition: word, condition_failed: word === 'not' ? failedOn(c, [first.hash]) : null, missed };
  if (v.paidUp !== undefined) Object.defineProperty(out, 'paidUp', { value: v.paidUp, enumerable: false });
  return out;
}
function promiseViewBase(first, blocks, opts) {
  const s = promiseStage(first, blocks);
  if (!s || s.not_shown) return s || null;
  const pool = new Pool([first, ...poolOf(blocks).all()]);
  // expired once every live offer has an expires the reader's clock has passed (one still open could bind)
  const past = s.live.length && s.live.every(h => { const o = pool.get(h), exp = o && termsOf(o).expires; return exp && opts && opts.now !== undefined && opts.now > exp; });
  if ((s.stage === 'offered' || s.stage === 'asked') && past) return { ...s, stage: 'expired' };
  // R-H10 (folds.md, Views): once the reader's clock is past a promise's `terms.until` and the promise moves nothing, the view says elapsed. A fact of its term, never that it was kept; it binds no one. One a stop ended stays stopped.
  const o = pool.get(s.offer), t = o ? termsOf(o) : {};
  const running = s.stage === 'accepted' || s.stage === 'underway';
  // stage 5 compare: "moves nothing" is a fact of its term: it names no `what`, no `lines` and no `quantity` (nothing goes from its signer)
  const moves = o && (o.refs.what !== undefined || t.lines !== undefined || t.quantity !== undefined);
  if (running && isStr(t.until) && opts && isStr(opts.now) && opts.now !== '' && opts.now > t.until && !moves) {
    const v = { ...s, stage: 'elapsed' };
    Object.defineProperty(v, 'paidUp', { value: s.paidUp, enumerable: false });
    return v;
  }
  return s;
}
// due (view): a relative when is due wait after the anchor arrived on the performer's node, on the performer's clock
function due(promise, arrivals) {
  const w = promise.state.when;
  if (!isObj(w) || w.after === undefined || w.wait === undefined) return null;
  const at = arrivals && arrivals[w.after];
  return at ? addDur(at, w.wait) : null;
}

// ================================================================ what is left (folds.md, What is left): ONE function counts everything that is drawn on
// A measure is an amount its owner stated. What each owner owns of it is drawn on along one line, in `seq` order, against a running amount; a draw holds from where it is
// signed, lands on the receiver's yes, is freed by her no or an end she has seen; one that does not fit takes nothing and is never cut down. Six readers (the ownership of an
// instance, a claim handed on, what a side is owed, an open offer's allocations, a pot's payouts, and a grant's part) say only what states the measure, who owns it first and what
// draws on it; they call this and nothing else. No fold compares every pair of draws; none orders by the size of a block's past, by a hash or by arrival.
//
// measure: { kind: { unit, of } | null, said: boolean, byUnit: boolean, unlimited?: boolean,
//            firsts: [{ owner, start: block|null, f: fraction, key?: line }], adds: [{ owner, f, at: hash }] }
//   kind null / said false: one whole, or an amount not said: a draw states no amount (no_measure) and takes all its owner owns of it.
//   byUnit: an instance's kind is the unit of its pack (a draw carries no `of`); otherwise unit and of both.
//   adds: pay-ins, plain sums added to an owner's first line for the draws that have `at` in their causal past (the pot).
// draw: { block, by, to (id | 'open' | null), amount (amount | null = all), lands: 'accept' | 'stands' | 'at once' | 'never', stays: bool (what lands is still in the measure),
//         key?: line (a grant's part), freers?: [hash] (blocks that free it besides the receiver's no), pass?: { owner, key } (the part a grant passes), cond?: transfer }
// Returns { not_shown, lacks, draws: [entry], rows: Map(hash -> row), holdings, owners, held, ended, let_go }.
let UNIQ = 0;
let WALKED = null; // when a set: the blocks every line a fold reads runs through (exportOf collects them: nodes.md, Her record at a host)
const idOfSet = new WeakMap();
const setId = s => { if (!idOfSet.has(s)) idOfSet.set(s, ++UNIQ); return idOfSet.get(s); };
function drawsOn(pool, measure, drawList, opts) {
  const seen = (opts && opts.seen) || (() => true), now = (opts && opts.now) || '';
  const forkset = equivocated(pool);
  const ownKeyOf = b => { const k = signerKeyOf(b, pool); return k === null || k === undefined ? '' : k; };
  // 1.9 3b-6: a line goes on past a key replacement: a key grant that names in `state.counted_to` the last block of the old key that counts continues that key's line on the new key
  const keyOfB = b => {
    for (let hops = 0; hops < 16; hops++) {
      const kg = isStr(b.refs.key) ? pool.body(b.refs.key) : null;
      const x = kg && isStr(kg.state.counted_to) ? pool.get(kg.state.counted_to) : null;
      if (!x || !isObj(x.refs) || x.refs.author !== b.refs.author || ownKeyOf(x) === ownKeyOf(b)) break;
      b = x;
    }
    return ownKeyOf(b);
  };
  const seqOf = b => (Number.isInteger(b.state.seq) ? b.state.seq : 0);
  const ptl = h => pool.past(h);
  const waiting = [], lacksAll = [];
  const sayKeys = new WeakMap(); // seat 33: the keys already said, per list, so each new one is checked once
  const say = (arr, x) => { const k = jcs(x); let ks = sayKeys.get(arr); if (!ks) { ks = new Set(arr.map(y => jcs(y))); sayKeys.set(arr, ks); } if (!ks.has(k)) { ks.add(k); arr.push(x); } };
  // ---- the receiver's no, and an end of the draw she has seen
  const ansIdx = new Map();
  for (const a of pool.all()) if (seen(a.hash) && a.refs && a.refs.answers !== undefined) for (const h of asList(a.refs.answers)) { if (!ansIdx.has(h)) ansIdx.set(h, []); ansIdx.get(h).push(a); }
  const answersTo = d => (ansIdx.get(d.block.hash) || []).filter(a => counts(a, pool));
  const answersFor = h => (ansIdx.get(h) || []).filter(a => counts(a, pool));
  const stopIdx = new Map();
  for (const w of pool.all()) if (seen(w.hash) && w.state && w.state.status === 'stopped' && w.refs && w.refs.updates !== undefined) { if (!stopIdx.has(w.refs.updates)) stopIdx.set(w.refs.updates, []); stopIdx.get(w.refs.updates).push(w); }
  let bySpeaker = null;
  const speakerBlocks = id => { if (!bySpeaker) { bySpeaker = new Map(); for (const b of pool.all()) if (seen(b.hash) && b.refs && counts(b, pool)) { const sp = speakerOf(b, pool); if (sp !== null && sp !== undefined) { if (!bySpeaker.has(sp)) bySpeaker.set(sp, []); bySpeaker.get(sp).push(b); } } } return bySpeaker.get(id) || []; };
  // 1.9 3c-3 (Rule A): her `declined` or `stopped` answer to the draw, to the deal it is `for`, or her counter to the offer that is the draw
  // her no: her `declined` or `stopped` answer (folds.md, Freed); an observe that answers it says it as well as a block of its own type (things.md, Letting go)
  const isNo = a => (a.state.status === 'declined' || a.state.status === 'stopped') && (a.type === 'transfer' || a.type === 'promise' || (a.type === 'observe' && a.refs.answers !== undefined));
  // the giver's own end of a transfer: her counted stop (an updates of it, stopped); a time it states (expires) is read only against the receiver's own dated word (blocks.md, Time)
  const stopsOf = d => (stopIdx.get(d.block.hash) || []).filter(w => w.type === d.block.type && counts(w, pool) && speakerOf(w, pool) === d.by);
  // 1.9 3d-15 (stage 5): her close is an end by its giver of every standing word of hers but a will (a transfer on `{ closed: <her id> }`)
  const endsOf = d => [...stopsOf(d), ...((isObj(d.block.state.condition) && d.block.state.condition.closed !== undefined) ? [] : (identityFold(d.by, pool).closes || []).filter(c => seen(c)).map(c => pool.get(c)).filter(Boolean))];
  const expiresOf = d => (d.block.type === 'transfer' && isStr(d.block.state.expires) ? d.block.state.expires : d.block.type === 'promise' && isStr(termsOf(d.block).expires) ? termsOf(d.block).expires : null);
  // 1.9 3d-2: a time a word states is an end of that word. On a clock the word names, its clocks' cutoffs show it; with none, an accept is in time only by its own `at`, before the end. An accept at or after the end, or with no `at`, is not in time:
  // it binds its giver only by her own later block, or by a relier's block that has it in its causal past. 1.9-GUESS [3d-2]: her later block that "acts on it" is a counted block of hers, not a decline, that has the accept in its causal past and names the draw, the deal or the accept
  const clocksOfDraw = d => (d.block.type === 'promise' ? clocksOf(termsOf(d.block).clocks) : d.block.type === 'transfer' && d.block.state.clocks !== undefined ? clocksOf(d.block.state.clocks) : null);
  const acceptInTime = (d, a) => { const exp = expiresOf(d); if (exp === null) return true; const ks = clocksOfDraw(d); return ks ? inTimeByClock(a.hash, ks, pool, exp) : isStr(a.state.at) && a.state.at < exp; };
  const actedOnLate = (d, a) => pool.all().some(x => seen(x.hash) && x !== a && isStr(x.refs.author) && speakerOf(x, pool) === d.by && counts(x, pool) && x.state.status !== 'declined' && ptl(x.hash).has(a.hash) && Object.entries(x.refs).some(([k, v]) => !['author', 'prev', 'key'].includes(k) && asList(v).some(h => h === d.block.hash || h === a.hash || asList(d.block.refs.for).includes(h))));
  const yesOf = (d, a) => a.state.status === 'accepted' && speakerOf(a, pool) === d.to && (a.type !== 'transfer' || answerStands(d.block, a, pool)) && (acceptInTime(d, a) || actedOnLate(d, a) || reliedOn(a, pool));
  // the blocks that free a draw, for the draws that have one in their causal past: the receiver's no that has none of her yes in its past, and her block that has seen an end
  // (a stop of the giver's that has none of her yes in its past; a time she dates past `expires`) before any yes
  const freersOf = d => {
    const memo = d._freers; if (memo) return memo;
    const out = new Set(d.freers || []);
    if (d.to !== null && d.to !== undefined && d.to !== 'open') {
      const mine = speakerBlocks(d.to);
      const yeses = answersTo(d).filter(a => yesOf(d, a)).map(a => a.hash);
      const noYesIn = b => !yeses.some(y => ptl(b.hash).has(y));
      // 1.9 3c-3 (Rule A): her own no frees the draw whether or not her yes came before (it is hers to give up until it lands); an end by its giver with her yes in its past frees nothing
      for (const a of answersTo(d)) if (isNo(a) && speakerOf(a, pool) === d.to) out.add(a.hash);
      for (const fh of asList(d.block.refs.for)) for (const a of answersFor(fh)) if (isNo(a) && speakerOf(a, pool) === d.to) out.add(a.hash);
      if (d.block.type === 'promise') {
        // 1.9 3c-2: an offer that is a draw is freed exactly where the accept that answers it does not bind: the giver's decline of that accept; her counter to the offer is her no
        for (const a of answersTo(d)) {
          if (a.type === 'promise' && a.state.status === undefined && speakerOf(a, pool) === d.to) out.add(a.hash); // 1.9-GUESS [3c-1]: her counter (a promise that answers the offer) frees it
          for (const x of answersFor(a.hash)) if (x.state.status === 'declined' && speakerOf(x, pool) === d.by) out.add(x.hash);
        }
      }
      // 1.9 3c-4: where a draw's landing waits on payment (`terms.waits_on: price`), its signer's end frees it where no block of his side accepting a payment toward the price is in the end's causal past
      // 1.9-GUESS [3c-4]: "a block of his side accepting a payment toward the price" is his counted `accepted` answer to a block `for` the deal, or his `received` of one; the deal is the draw's own offer or the deal it is `for`
      if (waitsOnPrice(d)) {
        const deals = new Set([d.block.hash, ...asList(d.block.refs.for)]);
        const paidIn = e => pool.all().some(x => seen(x.hash) && counts(x, pool) && ptl(e.hash).has(x.hash) && speakerOf(x, pool) === d.by && ((x.state.status === 'accepted' && asList(x.refs.answers).some(h => { const t = pool.get(h); return !!t && t.hash !== d.block.hash && t.type === 'transfer' && asList(t.refs.for).some(f => deals.has(f)); })) || (x.type === 'observe' && x.state.kind === 'received' && asList(x.refs.for).some(f => deals.has(f)))));
        for (const e of endsOf(d)) if (!paidIn(e)) out.add(e.hash);
      }
      // 1.9 3d-15 (stage 5): her close is an end by its giver of every standing word of hers but a will, read as any end of hers (endsOf)
      const ends = endsOf(d).filter(w => noYesIn(w));
      // 1.9 3c-3 (Rule A), the clock path (stage 5 compare): where the draw names a clock (an offer's `terms.clocks`, a transfer's `state.clocks`), an end by its giver that has
      // no yes of hers in its past frees it once the lines that read no (`names` less `needed`, plus one) hold the end with no yes before it
      { const ks = clocksOfDraw(d); if (ks && yeses.length) for (const e of ends) if (yeses.every(y => endFirstOn(y, e.hash, ks, pool))) out.add(e.hash); }
      for (const e of ends) for (const b of mine) if (b.hash !== e.hash && ptl(b.hash).has(e.hash) && noYesIn(b)) out.add(b.hash);
      // 1.9 3c-2, 3d-2: a time a draw states (`expires`) is an end of it and frees nothing by a date: it is read in `yesOf` (an accept not in time is no yes)
      // 1.9-GUESS [3d-2]: an offer that no yes has answered is freed by its giver's counted stop at once: no accept in time can still reach it unseen once she has stopped it
      if (d.block.type === 'promise' && !answersTo(d).some(a => yesOf(d, a))) for (const e of endsOf(d)) out.add(e.hash);
    }
    d._freers = out;
    return out;
  };
  // the terms of the draw's own offer, or of the deal it is `for` (the first promise)
  const waitsOnPrice = d => { const t = b => b && b.type === 'promise' && isObj(b.state.terms) && b.state.terms.waits_on === 'price'; return t(d.block) || asList(d.block.refs.for).some(h => t(pool.get(h))); };
  // 1.9 3c-5: a condition that can no longer hold, by the signed words and clock it names, frees what it held, for its giver's later draws that have that in their past
  const deadMemo = new Map();
  const deadIn = (d, past) => {
    if (!d.cond) return false;
    const k = d.block.hash + '|' + (past ? setId(past) : '');
    if (!deadMemo.has(k)) deadMemo.set(k, conditionDead(d.block.state.condition, pool.all().filter(b => seen(b.hash) && (!past || past.has(b.hash)))));
    return deadMemo.get(k);
  };
  const freedFor = (d, x) => { for (const f of freersOf(d)) if (ptl(x.block.hash).has(f)) return true; return deadIn(d, ptl(x.block.hash)); };
  // ---- her yes: the accepted answers (and her binding accept of the deal the draw is for, in the draw's own past), one start (folds.md, One start)
  const oneStart = (cands, d) => oneStartIn(pool, cands, d && d.to === d.by);
  function yesCandidates(d) {
    const out = [];
    const freers = freersOf(d);
    for (const a of answersTo(d)) if (yesOf(d, a) && ![...freers].some(f => ptl(a.hash).has(f))) out.push(a);
    if (opts && opts.dealYes) for (const a of opts.dealYes(d)) if (!out.includes(a)) out.push(a);
    return out;
  }
  // ---- one pass over every line, from the holdings given; the holdings come out of the draws that landed
  // 1.9 CORE-SET 3b: a line is read in `prev` order (3b-1, 3b-3); a block out of its place takes nothing (3b-1); the draws of a pair on this measure are decided together (3b-5, Rule B); a later block of a
  // key whose pair did not fit reads `pair` (3b-2). `pairLines` is the lines whose pair is unresolved: their signer's amount is no one's while it is (3b-9).
  let forkedLines = new Set();
  const pairInfo = []; // [{ line, members: [{ draw, to, yes }] }] of the pairs left standing in the last pass (3b-9)
  const lineI = lineInfoOf(pool);
  const pairsAll = forkPairs(pool);
  const parent = new Map(); // union of the pair stars: block hash -> root
  const find = h => { while (parent.has(h) && parent.get(h) !== h) h = parent.get(h); return h; };
  for (const [x, y] of pairsAll) { if (!parent.has(x)) parent.set(x, x); if (!parent.has(y)) parent.set(y, y); parent.set(find(y), find(x)); }
  function evaluate(holdings) {
    forkedLines = new Set(); pairInfo.length = 0;
    const rows = new Map(), byLine = new Map();
    for (const d of drawList) {
      // G13: a block of a tool of hers that speaks for her (under her grant) is read on the part she passed to that tool, where one was passed
      if (d.ownKey === undefined) d.ownKey = d.key !== undefined ? d.key : null;
      d.key = d.ownKey !== null ? d.ownKey : isStr(d.by) && d.block.refs.under !== undefined && d.block.refs.author !== d.by && holdings && holdings.has(lineId(d.by, 'pass:' + d.block.refs.author)) ? 'pass:' + d.block.refs.author : keyOfB(d.block);
      // 1.9 stage 6 (C21): a draw that speaks for a circle is counted on the circle's line: the meter's where it names one; with none, the line of the key that signed the circle's start for the measure, which another key's block joins only by a
      // block that names in `state.counted_to` the last block of that line that counts (A line goes on)
      if (isStr(d.by) && d.block.refs.as === d.by) {
        if (circleLineOf(d.by)) { d.key = 'circle'; d.mseq = meterPlace(circleLineOf(d.by), d.block.hash); }
        else if (isStr(d.block.state.counted_to)) { const X = pool.get(d.block.state.counted_to); if (X && ptl(d.block.hash).has(X.hash) && holdings && holdings.has(lineId(d.by, ownKeyOf(X)))) d.key = ownKeyOf(X); }
      }
      if (d.kind === 'allocation') continue; // read together below (3b-4)
      if (d.will) continue; // 1.9 3d-16: a will holds nothing in life; at her close it takes in the order of her line, after what was drawn (read below)
      const lk = d.by + '\u0000' + d.key;
      if (!byLine.has(lk)) byLine.set(lk, []);
      byLine.get(lk).push(d);
    }
    // ---- 3b-4: allocations the record does not order are counted together. An allocation is counted against another only where the other is in its causal past; allocations none of which is in another's
    // past (the phone's and the till's) come to more than what is left: none of them takes, each is shown past (over_allocated) and still binds its signer
    { const allocs = drawList.filter(d => d.kind === 'allocation');
      if (allocs.length) {
        const holding = [...holdings.values()].find(h => h.owner === allocs[0].by), total = holding ? fsumF(holding.incs.map(i => i.f)) : F0;
        const taken = [];
        let remaining = allocs.slice();
        while (remaining.length) {
          const mins = remaining.filter(a => !remaining.some(b => b !== a && ptl(a.block.hash).has(b.block.hash)));
          const availFor = a => { let v = total; for (const t of taken) if (ptl(a.block.hash).has(t.d.block.hash) && !freedFor(t.d, a)) v = fsub(v, t.amount); return v; };
          const want = a => (a.amount ? dec(a.amount.value) : availFor(a));
          let ok = !!holding;
          const clusterSum = fsumF(mins.map(want));
          for (const a of mins) if (fcmp(clusterSum, availFor(a)) > 0 && !measure.unlimited) ok = false;
          if (mins.length === 1 && !holding) ok = false;
          for (const a of mins) {
            const row = { d: a, takes: ok && fpos(want(a)), why: ok && fpos(want(a)) ? null : (holding ? 'past' : 'not_owner'), amount: ok && fpos(want(a)) ? want(a) : null, landed: false, wait: [] };
            rows.set(a.block.hash, row);
            if (row.takes) taken.push(row);
          }
          remaining = remaining.filter(a => !mins.includes(a));
        }
      } }
    for (const [lk, list] of byLine) {
      // 3b-3: a fold reads a line in `prev` order; `seq` numbers the line and never orders it. Blocks of one depth (the branches of a pair) are decided together, never by their hash
      const continued = d => ownKeyOf(d.block) !== d.key; // 3b-6: a block of the new key that goes on the old key's line comes after the old key's blocks
      list.sort((x, y) => (continued(x) ? 1 : 0) - (continued(y) ? 1 : 0) || ((x.mseq === null || x.mseq === undefined ? Infinity : x.mseq) === (y.mseq === null || y.mseq === undefined ? Infinity : y.mseq) ? 0 : (x.mseq === null || x.mseq === undefined ? Infinity : x.mseq) < (y.mseq === null || y.mseq === undefined ? Infinity : y.mseq) ? -1 : 1) || lineI.of(x.block).depth - lineI.of(y.block).depth || cmp(x.block.hash, y.block.hash));
      const holding = holdings.get(lk);
      const owner = list[0].by;
      let hard = F0; const soft = []; // what earlier draws on this line took: a sum, and the few that a no, an end or a part-accept may free
      const done = new Set();
      let conflict = false; // a pair on this line that does not fit stands unresolved
      let lingering = F0; // 3b-6: what the pair's draws that did not take come to: it stays out of what the new key may draw on, until the pair ends
      // one draw read against the running amount, with nothing changed: its row (takes, why, landed ...)
      const readOne = d => {
        const row = { d, takes: false, why: null, amount: null, landed: false, wait: [] };
        const past = ptl(d.block.hash);
        const place = lineI.of(d.block);
        if (place.s === 'out_of_place') { row.why = 'out_of_place'; return row; } // 3b-1: a block out of its place takes nothing and binds its signer as a block of a fork does
        // 3b-1: a draw on no line of its key takes nothing (`not_on_line`), and that is its answer, read before whose the measure is (end pass 2026-11-20)
        if (place.s === 'off') { row.why = 'not_on_line'; return row; }
        // she owns some of it where the draw stands, but on another line (or on none): not_on_line; none at all there: not_owner
        // (an amount that came by a draw counts where that draw is in the past: 3b-3)
        const ownsHere = [...holdings.values()].some(h => h.owner === owner && h.incs.some(i => (i.seen ? past.has(i.seen) || i.seen === d.block.hash : i.at === null || (Array.isArray(i.at) ? i.at.some(x => past.has(x) || x === d.block.hash) : past.has(i.at) || i.at === d.block.hash))));
        // 3b-9: an answer never says "nobody" where it turns on a block not held: a draw by one who owns some of the measure somewhere, whose own
        // line back from it lacks a block (what she owned there could be in it), is not shown, never not_owner (end pass 2026-11-20, as the core reads it)
        const ownsAnywhere = [...holdings.values()].some(h => h.owner === owner);
        const lacksBack = () => { if (!ownsAnywhere) return []; const w = walkLine(pool, d.block.hash, null, opts && opts.asked); return w.lacks.filter(l => typeof l !== 'string' || !pool.get(l)); };
        if (!holding && !ownsHere) { const l = lacksBack(); if (l.length) { for (const x of l) say(lacksAll, x); row.why = 'not_shown'; return row; } }
        if (!holding) { row.why = ownsHere ? 'not_on_line' : 'not_owner'; return row; }
        // the line is read whole from the draw back to her start (folds.md, A line)
        if (holding.start && holding.start.hash !== d.block.hash && keyOfB(holding.start) === d.key && (place.s === 'on' || place.s === 'hole' || place.s === 'out_of_place' || seqOf(d.block) > seqOf(holding.start) || true)) {
          const w = walkLine(pool, d.block.hash, holding.start.hash, opts && opts.asked);
          if (WALKED) for (const h of w.path) WALKED.add(h);
          if (opts && opts.read) for (const h of w.path) opts.read.add(h);
          if (w.lacks.length) { for (const l of w.lacks) say(lacksAll, l); row.why = 'not_shown'; return row; }
          if (!w.reached) { row.why = ownsHere ? 'not_on_line' : 'not_owner'; return row; } // one who owns none of it where the draw stands: not_owner ([S3-6])
        }
        const atOk = at => at === null || (Array.isArray(at) ? at.some(x => past.has(x)) : past.has(at));
        // whether a draw takes is read from its own causal past and nothing else: an amount that came to her counts only where the draw that brought it is in the past (3b-3)
        const incs = holding.incs.filter(i => atOk(i.at) && (!i.seen || i.seen === d.block.hash || past.has(i.seen)) && (i.cond === undefined || condHeldIn(i.cond, past)));
        // DECIDED (03-amounts, What building changed): [S3-6] a draw by one who owns none of the measure where it stands is `not_owner`; one who owns some there on another line, or on none (two accepts apart, vector 36), is `not_on_line`
        if (!incs.length && !ownsHere) { const l = lacksBack(); if (l.length) { for (const x of l) say(lacksAll, x); row.why = 'not_shown'; return row; } }
        if (!incs.length) { row.why = ownsHere ? 'not_on_line' : 'not_owner'; return row; }
        const total = fsumF(incs.map(i => i.f));
        let avail = fsub(total, hard);
        for (const t of soft) avail = fsub(avail, owedBy(t, d));
        if (continued(d)) avail = fsub(avail, lingering);
        // 1.9 3c-1: the hold of the offer this transfer performs is out of what is left; the transfer takes it over
        if (d.performs) { const orow = rows.get(d.performs.block.hash); if (orow && orow.takes && !orow.superseded) avail = fadd(avail, owedBy(orow, d)); }
        row.avail = avail;
        if (d.amount && !measure.unlimited) {
          if (measure.noKind) { row.why = 'unit'; return row; }
          if (!measure.said) { row.why = 'no_measure'; return row; }
          if (!(measure.byUnit ? d.amount.unit === measure.kind.unit && !('of' in d.amount) : sameKind(d.amount, measure.kind))) { row.why = 'unit'; return row; }
        }
        const want = d.amount ? dec(d.amount.value) : avail;
        // it would fit once an end she has not seen frees an earlier draw: waiting, never past (folds.md, What is left)
        const freedIfSeen = () => { let more = F0; for (const t of soft) if (!t.landed && freersOf(t.d).size === 0 && endIn(t.d, past)) more = fadd(more, t.amount); return more; };
        if (!fpos(want)) {
          if (!d.amount && fpos(freedIfSeen())) { row.why = null; row.wait.push({ block: d.block.hash, on: 'end' }); return row; }
          row.why = fpos(total) ? 'past' : 'not_owner'; return row;
        }
        if (!measure.unlimited && fcmp(want, avail) > 0) {
          if (fcmp(want, fadd(avail, freedIfSeen())) <= 0) { row.why = null; row.wait.push({ block: d.block.hash, on: 'end' }); return row; }
          row.why = 'past'; return row;
        }
        row.takes = true; row.amount = want;
        const st = standsOf(d.block, pool);
        const yesBefore = d.lands === 'accept' && yesCandidates(d).some(a => past.has(a.hash));
        const blocking = st.waiting.filter(x => x.on !== 'condition' && !(yesBefore && x.on === 'end'));
        if (!st.stands && !st.waiting.length) { row.never = true; }
        for (const wv of blocking) say(row.wait, wv);
        const standing = st.stands || (st.waiting.length > 0 && blocking.length === 0);
        if (d.lands === 'at once') row.landed = true;
        else if (d.lands === 'stands') row.landed = standing && condLands(d);
        else if (d.lands === 'accept' && standing) {
          const ys = yesCandidates(d);
          if (ys.length) {
            const start = oneStart(ys, d);
            let landedF = row.amount, freedF = F0;
            const said = (start ? [start] : ys).map(a => a.state.amount).find(a => isAmount(a) && (measure.byUnit ? a.unit === (d.amount || measure.kind).unit : sameKind(a, d.amount || measure.kind)) && fcmp(dec(a.value), row.amount) <= 0);
            if (said && measure.said) { landedF = dec(said.value); freedF = fsub(row.amount, landedF); }
            if (condLands(d)) {
              row.landed = true; row.start = start; row.landedF = landedF; row.freedF = freedF; row.yes = ys;
              if (fpos(freedF)) row.partFreedBy = (start || ys[0]).hash;
            }
          }
        }
        if (row.landed && row.landedF === undefined) row.landedF = row.amount;
        return row;
      };
      // what a draw that takes does to the running amount: held in full, or soft where a no, an end or a part-accept may free it
      const commit = row => {
        const d = row.d;
        if (d.performs) { const orow = rows.get(d.performs.block.hash); if (orow && orow.takes && !orow.superseded) { orow.superseded = row; const i = soft.indexOf(orow); if (i >= 0) soft.splice(i, 1); else hard = fsub(hard, orow.amount); } }
        if (row.landed ? (row.freedF && fpos(row.freedF)) : (freersOf(d).size > 0 || endsOf(d).length > 0 || deadIn(d, null))) soft.push(row); else hard = fadd(hard, row.amount);
      };
      const setRow = row => rows.set(row.d.block.hash, row);
      // ---- the draws of a pair on this measure, decided together (3b-5)
      // 1.9 3b-13 (a clock orders a pair where his voice states a reach): NOT BUILT in this half. It waits for the random-world test (CORE-SET 3b-13); until then a pair is read as A fork is a burden says
      const groupOfDraw = d => { const r = parent.has(d.block.hash) ? find(d.block.hash) : null; return r === null ? null : list.filter(x => parent.has(x.block.hash) && find(x.block.hash) === r && lineI.of(x.block).s !== 'off'); };
      const decideGroup = G => {
        // twins `for` one deal count once: the same deal in `refs.for`, the same receiver and the same amount (3b-5)
        const sig = d => (asList(d.block.refs.for).length ? jcs([asList(d.block.refs.for), d.to, d.amount, d.kind]) : null);
        const reps = [], twinOf = new Map();
        for (const d of G.slice().sort((x, y) => cmp(x.block.hash, y.block.hash))) { const sg = sig(d), r = sg === null ? null : reps.find(x => sig(x) === sg); if (r) twinOf.set(d.block.hash, r); else reps.push(d); }
        // 1.9 3b (decided, CORE-SET "What building changed"): a pair is decided from what each draw would do alone (readOne): all that fit take; else those with her yes (landed) take where they fit, a draw without her yes changes nothing; two with her yes that do not fit: neither, `pair`. Twin rows are listed as the draw they repeat, with an amount of nothing
        const cand = new Map(reps.map(d => [d.block.hash, readOne(d)]));
        // the receivers' own `declined` or `stopped` answers (whether or not her yes came before) give a draw up; one draw left is read as a draw alone
        const givenUp = d => answersTo(d).some(a => isNo(a) && speakerOf(a, pool) === d.to);
        const live = reps.filter(d => !givenUp(d));
        const C = reps.filter(d => cand.get(d.block.hash).takes && !givenUp(d));
        // her yes, landed or not (rule 4: a draw of the pair without its receiver's yes changes nothing on the others); a make names no receiver and needs no one's yes
        const hasYes = d => d.to == null || yesCandidates(d).length > 0;
        const S = C.filter(hasYes);
        const sum = list2 => fsumF(list2.map(d => cand.get(d.block.hash).amount));
        let first = null; for (const d of C) { const a = cand.get(d.block.hash).avail; if (a && (first === null || fcmp(a, first) < 0)) first = a; }
        const fitsAll = C.length > 0 && first !== null && fcmp(sum(C), first) <= 0;
        let takers = [];
        if (live.length === 1) takers = C.filter(d => d === live[0]);
        else if (fitsAll) takers = C;
        else if (S.length >= 2 && first !== null && fcmp(sum(S), first) <= 0) takers = S;
        else if (S.length === 1) takers = S;
        const conflictHere = live.length >= 2 && !fitsAll && !(S.length === 1 && C.length > 1 && false) && !(takers.length === C.length && C.length > 0);
        const unresolved = live.length >= 2 && C.length >= 2 && !fitsAll && S.length >= 2 && takers.length < S.length;
        for (const d of G) {
          const rep = twinOf.get(d.block.hash) || d, row0 = cand.get(rep.block.hash);
          if (!row0) continue;
          let row;
          if (takers.includes(rep)) row = twinOf.has(d.block.hash) ? { ...row0, d, amount: F0, landedF: F0, freedF: undefined, twin: true } : row0;
          else { const why = row0.why !== null && !row0.takes ? row0.why : (givenUp(rep) ? null : 'pair'); row = { d, takes: false, why, amount: null, landed: false, wait: why === 'pair' ? [] : row0.wait || [] }; if (row0.takes && givenUp(rep)) { row.takes = true; row.amount = row0.amount; row.landed = false; row.givenUp = true; } } // a draw that takes nothing (`pair`) waits on nothing
          setRow(row); done.add(d.block.hash);
          if (row.takes && !row.twin && !row.givenUp) commit(row); // a draw of a pair its receiver gave up holds nothing against the others (3b-5): it is freed
        }
        if (unresolved) { conflict = true; lingering = fadd(lingering, sum(S)); pairInfo.push({ line: lk, members: G.map(d => ({ draw: d.block.hash, to: d.to === undefined ? null : d.to, yes: hasYes(twinOf.get(d.block.hash) || d) })) }); }
      };
      for (const d of list) {
        if (done.has(d.block.hash)) continue;
        const G = groupOfDraw(d);
        if (G && G.length >= 2) { decideGroup(G); continue; }
        // a later block of a key whose pair did not fit reads `pair` (3b-2): it is a block of a fork and draws on a measure the pair names
        if (conflict && forkset.has(d.block.hash)) { setRow({ d, takes: false, why: 'pair', amount: null, landed: false, wait: [] }); continue; }
        const row = readOne(d); setRow(row);
        if (row.takes) commit(row);
      }
      if (conflict) forkedLines.add(lk);
    }
    // ---- 1.9 3d-16: her wills. While she can sign, a will holds nothing (it takes, is held, and no amount is out of what she owns); an accept of it before the close is a request. At the close her wills take in the order of her line, on
    // what her other draws left; a will whose thing is gone takes nothing. 1.9-GUESS [3d-16]: it lands where a yes of its receiver exists (an accept before the close is that yes); her stop of it counts as any stop does (the rule that
    // her stop counts once a clock received it before the cutoffs that closed the close's wait is not built).
    {
      const wills = drawList.filter(d => d.will).sort((x, y) => lineI.of(x.block).depth - lineI.of(y.block).depth || cmp(x.block.hash, y.block.hash));
      const leftOf = new Map();
      const leftOn = (owner, key) => {
        const lk = owner + '\u0000' + key;
        if (!leftOf.has(lk)) {
          const h = holdings.get(lk);
          let v = h ? fsumF(h.incs.filter(i => i.cond === undefined || condHeldIn(i.cond, null)).map(i => i.f)) : F0;
          for (const r of rows.values()) if (r.takes && r.d.by === owner && r.d.key === key && !r.d.will) { let out = r.amount; if (r.landed) { if (r.freedF && fpos(r.freedF)) out = fsub(out, r.freedF); } else if (r.givenUp || freersOf(r.d).size || deadIn(r.d, null)) out = F0; v = fsub(v, out); }
          leftOf.set(lk, v);
        }
        return leftOf.get(lk);
      };
      for (const d of wills) {
        // 1.9 R-H7 (stage 5): while she can sign a will is no draw at all (it holds nothing; it is a word shown with the thing, `named_by`). At her first close (the one no
        // other of her closes has in its past) it is read, unless her stop of it is in that close's causal past (she may end it until the close)
        const cl = (identityFold(d.by, pool).closes || []).filter(c => seen(c));
        const first = cl.find(c => !cl.some(o => o !== c && ptl(c).has(o)));
        // her stop counts once it is in the close's causal past, or one of her clocks received it before the cutoffs that closed the close's wait (3d-16)
        const idfW = identityFold(d.by, pool);
        // (her stops of the will among every block held, as the core reads them: a stop names the will, not the thing)
        const willStops = pool.all().filter(w => w.state && w.state.status === 'stopped' && w.refs && w.refs.updates === d.block.hash && w.type === d.block.type && counts(w, pool) && speakerOf(w, pool) === d.by);
        if (first === undefined || willStops.some(w => ptl(first).has(w.hash) || (idfW.receivedBeforeCloseWait && idfW.receivedBeforeCloseWait(w.hash, first)))) continue;
        const row = { d, takes: false, why: null, amount: null, landed: false, wait: [], will: true };
        rows.set(d.block.hash, row);
        const key = d.key, left = leftOn(d.by, key);
        const closed = true;
        const want = d.amount && !measure.unlimited ? dec(d.amount.value) : left;
        if (d.amount && !measure.unlimited && !(measure.said && (measure.byUnit ? d.amount.unit === measure.kind.unit && !('of' in d.amount) : sameKind(d.amount, measure.kind)))) { row.why = measure.said ? 'unit' : 'no_measure'; continue; }
        if (!closed) { row.takes = true; row.amount = want; continue; } // in life: held, and holds nothing
        if (!holdings.get(d.by + '\u0000' + key) || !fpos(want) || fcmp(want, left) > 0) { row.why = holdings.get(d.by + '\u0000' + key) && fpos(left) !== false && fpos(want) ? 'past' : 'not_owner'; if (fpos(left) === false && holdings.get(d.by + '\u0000' + key)) row.why = 'past'; continue; }
        row.takes = true; row.amount = want;
        leftOf.set(d.by + '\u0000' + key, fsub(left, want));
        const ys = yesCandidates(d);
        if (ys.length) { const start = oneStart(ys, d); row.landed = true; row.landedF = want; row.start = start; row.yes = ys; }
      }
    }
    return rows;
  }
  // what an earlier draw still takes out of the line for a later one: all of it, unless a no or an end she saw (in the later draw's past) freed it; a part an accept left is freed by that accept
  const owedBy = (t, cur) => {
    if (t.landed) return t.freedF && fpos(t.freedF) && ptl(cur.block.hash).has(t.partFreedBy) ? fsub(t.amount, t.freedF) : t.amount;
    return freedFor(t.d, cur) ? F0 : t.amount;
  };
  // the end of a draw that stands in a causal past: her stop is in it
  const endIn = (d, past) => endsOf(d).some(w => past.has(w.hash));
  const condHeldIn = (t, past) => { try { return conditionHolds1(t, pool, h => seen(h) && (!past || past.has(h)), now); } catch (e) { return false; } };
  // 1.9 stage 5 (R-H9): a condition is read in the causal past of the block that relies on it. A draw whose condition does not hold on everything held has landed, for what was built on it, where a later draw of its receiver has it in its causal past and reads the
  // condition held there ("J1 used"): what landed and stood stays where it is. 1.9-GUESS [5-13]: "relies on it" is read as a draw of the receiver's, on any measure, that has the conditioned draw in its causal past
  const usedMemo = new Map();
  const usedUnder = d => {
    if (d.cond === undefined) return false;
    const k = d.block.hash;
    if (!usedMemo.has(k)) usedMemo.set(k, drawList.some(x => x !== d && x.by === d.to && !x.will && x.block.hash !== d.block.hash && ptl(x.block.hash).has(d.block.hash) && condHeldIn(d.cond, ptl(x.block.hash))));
    return usedMemo.get(k);
  };
  const condLands = d => d.cond === undefined || condHeldIn(d.cond, null) || usedUnder(d);
  // ---- holdings: each owner's amount on each key's line, from her first amount, the draws that landed to her, and a part a grant passed
  const lineId = (owner, key) => owner + '\u0000' + key;
  const circleLineOf = owner => { if (!isStr(owner)) return null; const C = pool.get(owner); if (!isFoundingCircle(C)) return null; pool._clm = pool._clm || new Map(); if (!pool._clm.has(owner)) { const cn = circleNow(owner, pool, null); pool._clm.set(owner, cn && cn.meter !== null ? cn.meter : null); } return pool._clm.get(owner); };
  // the place of a block on a circle's meter line: the order of the meter's receipts that name it (C21); null when none does
  const meterPlace = (meter, h) => { pool._mpl = pool._mpl || new Map(); if (!pool._mpl.has(meter)) { const M = pool.get(meter); const who = M ? (M.refs.author === undefined ? M.hash : M.refs.author) : meter; pool._mpl.set(meter, pool.all().filter(r => r.type === 'observe' && r.state.kind === 'receipt' && r.refs.author === who && counts(r, pool)).sort((x, y) => lineI.of(x).depth - lineI.of(y).depth || cmp(x.hash, y.hash))); } const recs = pool._mpl.get(meter); const i = recs.findIndex(r => asList(r.refs.derives_from).includes(h)); return i < 0 ? null : i; };
  function build(rows) {
    const holdings = new Map();
    const put = (owner, key, start, inc, noLine) => {
      if (circleLineOf(owner)) key = 'circle'; // 1.9 stage 6 (C21): every draw that speaks for a circle that names a meter is counted on the one line of that meter
      const id = lineId(owner, key);
      if (!holdings.has(id)) holdings.set(id, { owner, key, start: start || null, incs: [], noLine: !!noLine });
      const h = holdings.get(id);
      if (!h.start && start) h.start = start;
      h.incs.push(inc);
      return h;
    };
    for (const f of measure.firsts) {
      const key = f.key !== undefined ? f.key : f.start ? keyOfB(f.start) : '';
      put(f.owner, key, f.start, { f: f.f, at: f.start ? f.start.hash : null, cond: undefined });
    }
    for (const a of measure.adds || []) {
      const home = [...holdings.values()].find(h => h.owner === a.owner);
      if (home) home.incs.push({ f: a.f, at: a.at });
    }
    if (rows) for (const row of rows.values()) {
      const d = row.d;
      if (!row.takes) continue;
      if (d.pass) { put(d.pass.owner, d.pass.key, null, { f: row.amount, at: d.block.hash }); continue; }
      if (d.passTool) { if (row.landed && row.landedF && fpos(row.landedF)) put(d.passTool.owner, d.passTool.key, null, { f: row.landedF, at: (row.yes && row.yes[0] ? row.yes[0].hash : d.block.hash) }); continue; } // G13: the part starts on the receiving tool's line at its accept
      if (!d.stays || !row.landed || !row.landedF || !fpos(row.landedF) || typeof d.to !== 'string' || d.to === 'open') continue;
      if (row.start) put(d.to, keyOfB(row.start), row.start, { f: row.landedF, at: row.start.hash, cond: d.cond, seen: d.block.hash });
      else put(d.to, '~', null, { f: row.landedF, at: null, seen: d.block.hash }, true);
    }
    // a first use that takes what a let-go left: no draw, its own rule (folds.md, Ownership)
    if (rows && measure.takeUp) for (const row of rows.values()) {
      const d = row.d;
      if (d.kind !== 'letgo' || !row.takes || !row.landed) continue;
      const t = measure.takeUp(d, row);
      if (t) { row.takenUp = t; put(t.owner, keyOfB(t.start), t.start, { f: row.amount, at: t.start.hash }); }
    }
    return holdings;
  }
  const sig = hs => [...hs.values()].map(h => h.owner + '|' + h.key + '|' + h.incs.map(i => i.at + ':' + fText(fnorm(i.f))).join(',')).sort().join(';');
  let holdings = build(null), rows = evaluate(holdings);
  for (let round = 0; round < 40; round++) {
    const next = build(rows);
    if (sig(next) === sig(holdings)) break;
    holdings = next; rows = evaluate(holdings);
  }
  // a line that is not read whole answers nothing (folds.md, A line): not_shown, the blocks it would need
  const holes = [...rows.values()].some(r => r.why === 'not_shown');
  // the lacks in one order (as the core gives them): ids first, then the `{ author, key, seq }` entries, each by its canonical text
  if (holes) return { not_shown: true, lacks: lacksAll.slice().sort((x, y) => (typeof x === 'string') !== (typeof y === 'string') ? (typeof x === 'string' ? -1 : 1) : cmp(typeof x === 'string' ? x : jcs(x), typeof y === 'string' ? y : jcs(y))) };
  // ---- the draws listed, and the amounts left
  const entries = [], waitingOut = [];
  let held = F0, ended = F0, letGo = F0;
  const owners = new Map();
  const lineLeft = new Map(); // holding id -> what its owner has left
  for (const [id, h] of holdings) lineLeft.set(id, fsumF(h.incs.filter(i => i.cond === undefined || condHeldIn(i.cond, null)).map(i => i.f)));
  for (const row of rows.values()) {
    const d = row.d, b = d.block;
    let state = null;
    if (row.takes) {
      if (row.landed) state = 'landed';
      else state = row.givenUp || [...freersOf(d)].length || deadIn(d, null) ? 'freed' : 'held';
      if (row.superseded) state = row.superseded.landed ? 'landed' : state; // 1.9 3c-1: an offer performed by a transfer that lands is landed with it
    }
    for (const w of row.wait) say(waitingOut, w);
    // 1.9 (00-shared, Waiting): a draw held because its condition has not held is waiting on it (`on: condition`); no reader's clock shows it (3c-6)
    if (state === 'held' && !row.superseded && d.cond !== undefined && !condHeldIn(d.cond, null)) say(waitingOut, { block: b.hash, on: 'condition' });
    const entry = { block: b.hash, by: d.by, to: d.to === undefined ? null : d.to, amount: d.shown ? d.shown : d.amount ? { ...d.amount } : null, takes: row.takes, why: row.takes ? null : row.why, state };
    Object.defineProperty(entry, 'will', { value: !!row.will, enumerable: false });
    Object.defineProperty(entry, 'speaks', { value: d.speaks !== false, enumerable: false }); // whether the block binds the owner it draws for (a make that speaks for her starts her line)
    entries.push(entry);
    if (!row.takes) continue;
    const id = lineId(d.by, d.key);
    const h = holdings.get(id);
    // what the line has left: the draw's amount is out of it, unless it was freed (and the part an accept left unlanded is freed too)
    let out = row.amount;
    if (state === 'freed' || row.superseded || (row.will && !row.landed)) out = F0; // 1.9 3d-16: a will holds nothing while she can sign
    else if (row.landed && row.freedF && fpos(row.freedF)) out = fsub(out, row.freedF);
    if (h) lineLeft.set(id, fsub(lineLeft.get(id), out));
    if (state === 'held' && !d.pass && !row.superseded && !row.will) held = fadd(held, row.amount);
    if (d.pass) held = held; // a grant's part is held on the grant's line, never counted as held here
    if (!d.stays && row.landed && d.lands !== 'never') {
      if (d.to === 'open' || d.kind === 'letgo') { if (!row.takenUp) letGo = fadd(letGo, row.amount); }
      else if (d.kind === 'make') ended = fadd(ended, row.amount);
    }
  }
  for (const [id, h] of holdings) { const left = forkedLines.has(id) ? F0 : lineLeft.get(id); if (!fpos(left)) continue; owners.set(h.owner, fadd(owners.get(h.owner) || F0, left)); }
  entries.sort((x, y) => cmp(x.block, y.block));
  // the waiting list in one order, as the core gives it: by block, then by what it waits on
  waitingOut.sort((x, y) => cmp(x.block, y.block) || cmp(x.on, y.on));
  return { not_shown: false, rows, holdings, entries, waiting: waitingOut, owners, held, ended, letGo, pairs: pairInfo.map(p => ({ line: p.line, members: p.members })) };
}
// the first use that takes what a let-go left, and the owner it makes: nothing is a draw here (folds.md, Ownership)

// ================================================================ ownership and place (folds.md)
// principalOf(block): the circle the block was signed `as` (when its signer may sign for it), else its author; for a grant, its grantor
function principalOf(b, pool) { return b.refs.as !== undefined ? (mayActAsIn(b, b.refs.as, pool) ? b.refs.as : null) : b.refs.author; } // 1.9 stage 6: a row holds for it, or every owner signs it (circles.md, C0)
// who a block speaks for (folds.md, Who a block speaks for): one party. A block that names a circle in `as` speaks for it when its author may
// sign for it, else for no one; a block under a live grant made for its receiver speaks for the grantor (a promise outside the grant's scope is
// a quote request and still does; any other block outside it speaks for its author); any other block speaks for its author.
function speakerOf(b, pool) {
  const key = 'spk:' + b.hash, mine = pool.get(b.hash) === b;
  if (mine && pool.memo.has(key)) return pool.memo.get(key);
  const t0 = pool._taint || 0;
  const out = speakerNow(b, pool);
  if (mine && (pool._taint || 0) === t0) pool.memo.set(key, out); // an answer that read a circle's row while that row was being read (a ring) is not kept (06-circles.md)
  return out;
}
// under a grant: the block passes the door's whole authority test (whyNotUnder, G1). 1.9 stage 4 (P5): a promise a tool signs under a grant that
// keeps to no promise the grant names speaks for its signer alone (the quote request that spoke for its principal is gone)
function speakerNow(b, pool) {
  const g = b.refs.under !== undefined ? pool.get(b.refs.under) : null;
  if (g && g.type === 'grant' && (b.refs.as === undefined || b.refs.as === principalOfChain(g, pool)) && grantLive(g, pool, new Set(), b) && receives(g, b, pool) && !whyNotUnder(b, pool).length) return principalOfChain(g, pool);
  return principalOf(b, pool);
}
// the grant at the top of a chain: the grant, then each grant above it that it was passed on from (refs.parent), to the first not passed on. The one walk:
// backed, gives and speakerOf all read the top of a chain through it. Whether each link is live is whyNotUnder's question.
// A decline is a reading: an observe that answers a block and says declined (core.md, Types). One written before the three moods has the type of the
// block it answers and is read as before (append-only).
const isDeclineReading = b => b.type === 'observe' && b.state.status === 'declined' && b.refs.answers !== undefined;
// a machine's accept (promises.md, Answers): an observe that answers a promise, says accepted and acts under a grant (refs.under); its reading "accepted under her rule" is her accept only when the grant is live, made for the machine and covers it
const isMachineAccept = (b, pool) => b.type === 'observe' && b.state.status === 'accepted' && b.refs.under !== undefined && isStr(b.refs.answers) && !!pool.get(b.refs.answers) && pool.get(b.refs.answers).type === 'promise';
function grantTop(g, pool) { for (;;) { const up = g.refs.parent === undefined ? null : pool.get(g.refs.parent); if (!up) return g; g = up; } }
function principalOfChain(g, pool) { return principalOf(grantTop(g, pool), pool); }
// whether a receiver's accepted answer to a transfer still counts (things.md, Transfers): a transfer to a named receiver is read like an offer. The
// giver's withdrawal (their own updates of it, stopped with before) voids an accept that has it in its causal past; on a transfer that carried
// expires, the giver's declined answer to the accept voids it
// 1.9 3d-2: with no clock, an answer is in time only by its own `at`, before the end it answers; one in time lands, and the giver's decline of it takes back
// nothing (end pass 2026-11-20, as for a promise's accept, 00-shared Request)
const inTimeByAt = (a, t) => isStr(t.state.expires) && isStr(a.state.at) && a.state.at < t.state.expires;
function answerStands(t, a, pool) {
  const giver = speakerOf(t, pool);
  if (giver === null) return true;
  // the cheap conditions first: whose word a block is (a fold of its own) is asked only of a block that could withdraw this one
  return !pool.all().some(w => (w.type === 'transfer' || isDeclineReading(w)) &&
    ((w.type === 'transfer' && w.state.status === 'stopped' && w.state.stop === 'before' && w.refs.updates === t.hash && pool.sees(a.hash, w.hash)) ||
     (t.state.expires !== undefined && w.state.status === 'declined' && w.refs.answers === a.hash && !inTimeByAt(a, t))) && counts(w, pool) && speakerOf(w, pool) === giver);
}
// whether a block given whole is read among the blocks held (core.md, read): a fold asked about one that is not read gives no answer (00-shared, row 106)
const isReadIn = (b, blocks) => { try { return !!b && typeof b === 'object' && b.type !== undefined && readFindings(b, poolOf(blocks).all()).length === 0; } catch (e) { return false; } };
// the blocks held, and the thing itself when it is not among them (a thing given whole is read with the blocks)
const withThing = (thingIn, blocks) => { const held = poolOf(blocks); return typeof thingIn === 'string' || held.get(thingIn.hash) ? held : new Pool([thingIn, ...held.all()]); };

// the one start of an amount that came onto a line by accepts (folds.md, One start): the earliest accept; where two keys accepted apart (neither in the other's causal past) neither
// starts a line, unless a later block of hers whose `after` names both is the one start. null: no line.
function oneStartIn(pool, cands, passed) {
  const minimal = list => list.filter(x => !list.some(y => y !== x && pool.sees(x.hash, y.hash)));
  // 1.9 3b-8, One start: an amount that comes to her starts on the line of the voice her list marks `receives: true`, else her first voice. Another key's accept of it is her yes and starts nothing.
  // 1.9 3b (decided, CORE-SET "What building changed"): where her list names no voice (a thing that is no person, a list not read), the amount starts on the earliest accept as in 1.8
  const first = cands[0], owner = first && isStr(first.refs && first.refs.author) ? first.refs.author : null;
  const idf = owner ? identityFold(owner, pool) : null;
  // 1.9 3b (decided, CORE-SET "What building changed"): a transfer to its own giver (a part she hands from one key's line to another's) brings no amount to her: the accept of the key it is handed to starts that line, as before
  if (!passed && idf && idf.voices && idf.voices.length) {
    const v = idf.voices.find(x => isObj(x) && x.receives === true) || idf.voices[0];
    const mine = cands.filter(c => { const k = signerKeyOf(c, pool); return isStr(k) && (v.key === k || (isStr(v.key_hash) && hashNamesKey(v.key_hash, k))); });
    const mins = minimal(mine);
    return mins.length === 1 ? mins[0] : null;
  }
  let c = cands;
  for (let guard = 0; guard < 8; guard++) {
    const mins = minimal(c);
    if (mins.length <= 1) return mins[0] || null;
    const later = c.filter(x => !mins.includes(x) && mins.every(m => pool.sees(x.hash, m.hash)));
    if (!later.length) return null;
    c = later;
  }
  return null;
}
const WHOLE = { n: 1n, d: 1n };
const isMakeBlock = b => b.type === 'transform' && asList(b.refs.derives_from).length > 0;
const isKeepBlock = b => b.type === 'transform' && asList(b.refs.derives_from).length === 0 && isStr(b.refs.subject);
// DECIDED (03-amounts, What building changed): [S3-30] the ownership of a kind or of an actor is the empty answer (no owner, no draws), not null; the door answers null for a block it does not hold as read (00-shared, row 106)
const EMPTY_OWN = () => ({ kind: null, stated: null, owners: [], owner: null, held: null, ended: null, let_go: null, draws: [], waiting: [], pair: [], named_by: [], read: [] });
// whether a block is an instance by its own word: it names its kind, what it is part of or where it is, or a make it came from (things.md, Things). A kind has no owner.
const isInstance = t => !!t && t.type !== 'actor' && ['of', 'derives_from', 'subject', 'place'].some(k => asList(t.refs[k]).length > 0);

// within: the hashes it reads (a block's causal past), each block read as it is among all held; left out, all
function ownershipFold(thingIn, blocks, within, now = '') {
  const pool = withThing(thingIn, blocks);
  const thing = pool.get(typeof thingIn === 'string' ? thingIn : thingIn.hash);
  const seen = h => !within || within.has(h);
  if (!thing || !seen(thing.hash)) return EMPTY_OWN(); // an instance that rests on blocks not held is not read yet
  const memoKey = 'own|' + thing.hash + '|' + (within ? setId(within) : '') + '|' + now;
  if (pool.folds.has(memoKey)) { const v = pool.folds.get(memoKey); if (pool._busyF && pool._busyF.has(v)) if (pool._inCircle) pool._taint = (pool._taint || 0) + 1; return v; } // 1.9 stage 6: an answer that read the placeholder below is not kept by whoever asked
  { const ph = EMPTY_OWN(); (pool._busyF = pool._busyF || new WeakSet()).add(ph); pool.folds.set(memoKey, ph); } // a thing whose past leads back to itself is read as nothing
  warmOwnership(thing, pool, within, now);
  const t0 = pool._taint || 0;
  const out = ownershipNow(thing, pool, seen, within, now);
  if ((pool._taint || 0) === t0) pool.folds.set(memoKey, out); else pool.folds.delete(memoKey);
  return out;
}
// The folds a thing's first owners read (ownershipNow): each input of its makes in the same view, or the thing one keep keeps, where the
// keep stands. The same guards as ownershipNow, so exactly the folds it asks for, in its order.
function ownershipReadsFirst(thing, pool, within) {
  const seen = h => !within || within.has(h);
  if (thing.type === 'actor' || !isInstance(thing)) return [];
  const makes = asList(thing.refs.derives_from).map(h => pool.get(h)).filter(m => m && m.type === 'transform' && seen(m.hash) && counts(m, pool) && m.refs.author === thing.refs.author && (isMakeBlock(m) || (asList(m.refs.derives_from).length === 0 && !isStr(m.refs.subject))));
  if (makes.length) return makes.flatMap(m => asList(m.refs.derives_from).filter(h => h !== thing.hash).map(h => [h, within]));
  const keeps = asList(thing.refs.derives_from).map(h => pool.get(h)).filter(k => k && isKeepBlock(k) && seen(k.hash) && counts(k, pool));
  if (keeps.length !== 1) return [];
  const means = pool.get(keeps[0].refs.subject);
  return means && means.type === 'thing' ? [[means.hash, keepView(pool, keeps[0], within)]] : [];
}
// The view of a keep (its causal past, among what the reader sees), one Set per keep and view, so the fold of what it keeps is remembered.
function keepView(pool, k, within) {
  if (!pool.keepViews) pool.keepViews = new Map();
  const key = k.hash + '|' + (within ? setId(within) : '');
  if (!pool.keepViews.has(key)) pool.keepViews.set(key, new Set([...pool.past(k.hash)].filter(h => !within || within.has(h))));
  return pool.keepViews.get(key);
}
// Read the folds beneath a thing's own as ownershipFold's recursion would, deepest first, on a stack of our own instead of the call stack
// (security 08 F1): each is marked as being read exactly while the recursion would mark it, and remembered under the same key. The thing
// itself is left to the caller. How deep a chain of makes is changes no answer (a long history is no loop).
let READ_LIMIT = Infinity; // the most things one walk of makes reads; a reader's own choice (the protocol fixes no depth)
class WalkStopped extends Error { constructor(block) { super('the walk stopped before ' + block); this.block = block; } }
const setReadLimit = n => { const o = READ_LIMIT; READ_LIMIT = n === null || n === undefined ? Infinity : n; return o; };
function warmOwnership(thing, pool, within, now) {
  const frames = [{ deps: ownershipReadsFirst(thing, pool, within), i: 0 }];
  while (frames.length) {
    const top = frames[frames.length - 1];
    if (top.i < top.deps.length) {
      const [h, w] = top.deps[top.i++];
      const t = pool.get(h);
      if (!t || (w && !w.has(t.hash))) continue;
      const key = 'own|' + t.hash + '|' + (w ? setId(w) : '') + '|' + now;
      if (pool.folds.has(key)) continue;
      // 1.9 stage 7 (C5; folds.md, opening): a reader's own limit on a walk (`setReadLimit`). Where it stops it names the first block it did not read: here the make that made the thing it would read next
      if (frames.length >= READ_LIMIT) { const mk = asList(t.refs.derives_from).map(x => pool.get(x)).find(x => x && x.type === 'transform'); throw new WalkStopped(mk ? mk.hash : t.hash); }
      pool.folds.set(key, EMPTY_OWN());
      frames.push({ t, w, key, deps: ownershipReadsFirst(t, pool, w), i: 0 });
      continue;
    }
    frames.pop();
    if (top.t) pool.folds.set(top.key, ownershipNow(top.t, pool, x => !top.w || top.w.has(x), top.w, now));
  }
}
function ownershipNow(thing, pool, seen, within, now) {
  const isParts = isFoundingCircle(thing) && !!packOf(thing); // 1.9 stage 6 (C1): a circle's parts are an amount of a measure like any other, the founder's first
  if (thing.type === 'actor' && !isParts) return EMPTY_OWN(); // nothing reaches a person: no word makes an actor property (core.md, section 11)
  if (!isInstance(thing) && !isParts) return EMPTY_OWN();       // a kind: no owner, and a draw on it moves nothing (things.md, Things)
  const pack = isAmount(thing.state.pack) ? thing.state.pack : null;
  // DECIDED (03-amounts, What building changed): [S3-13] the `kind` an ownership answer gives is { unit, of }: the unit of the pack and, for an instance, its `refs.of` ("their kind is the measure's own (for an instance, its refs.of)"), null when it has none
  const ofId = asList(thing.refs.of).length ? asList(thing.refs.of)[0] : null;
  const keyOf = b => { const k = signerKeyOf(b, pool); return k === null || k === undefined ? '' : k; };
  const speaker = b => speakerOf(b, pool);
  // ---- who owns it first (folds.md, Who owns it first; things.md, A make)
  let said = !!pack, firsts = [];
  const acceptedBy = (owner, what) => pool.all().filter(a => seen(a.hash) && a.state.status === 'accepted' && asList(a.refs.answers).includes(what.hash) && counts(a, pool) && speaker(a) === owner);
  const noShown = [];
  const makes = asList(thing.refs.derives_from).map(h => pool.get(h)).filter(m => m && m.type === 'transform' && seen(m.hash) && counts(m, pool) && m.refs.author === thing.refs.author && (isMakeBlock(m) || (asList(m.refs.derives_from).length === 0 && !isStr(m.refs.subject))));
  const keeps = asList(thing.refs.derives_from).map(h => pool.get(h)).filter(k => k && isKeepBlock(k) && seen(k.hash) && counts(k, pool));
  if (makes.length) {
    // the output of a make belongs to the owner of what was taken; a first possession (no inputs) to its author
    const takes = [];
    for (const m of makes) {
      const inputs = asList(m.refs.derives_from).filter(h => h !== thing.hash);
      if (!inputs.length) { takes.push({ owner: speaker(m), f: null, unit: null, make: m, speaks: true }); continue; }
      for (const i of inputs) {
        const r = ownershipFold(i, pool, within, now);
        if (r.not_shown) return r;
        const rec = r.draws.find(x => x.block === m.hash && x.takes);
        if (rec) takes.push({ owner: rec.by, f: rec.took, unit: rec.amount ? rec.amount.unit : (r.stated ? r.stated.unit : null), make: m, speaks: rec.speaks });
      }
    }
    const owners = [...new Set(takes.map(t => t.owner).filter(isStr))];
    const lone = owners.length === 1;
    if (!lone) {
      // from several: each owns the amount taken from her, when the pack is the sum of what was taken in one kind; otherwise each is named with no amount
      const sameUnit = pack && takes.length && takes.every(t => t.f && t.unit === pack.unit);
      const total = sameUnit ? fsumF(takes.map(t => t.f)) : null;
      said = !!(sameUnit && fcmp(total, dec(pack.value)) === 0);
    }
    for (const o of owners) {
      const mine = takes.filter(t => t.owner === o);
      const f = lone ? (pack ? dec(pack.value) : WHOLE) : said ? fsumF(mine.map(t => t.f)) : WHOLE;
      // her start: a make that speaks for her (hers from that block), else her own accepted answer to the output (a make by someone else, a stranger's claim)
      // DECIDED (03-amounts, What building changed): [S3-10] cases 2 and 3 of her start (folds.md, What is left) are one rule here: her own `accepted` answer to the output; a stranger's make takes nothing of hers (`not_owner`), so it has no owner to start
      // DECIDED (03-amounts, What building changed): [S3-11] where several makes of hers speak for her, her start is the one that sees the others; apart, she owns the output on no line
      const speaking = mine.filter(t => t.speaks).map(t => t.make);
      let start = null, line = true;
      if (speaking.length) {
        const maxes = speaking.filter(x => !speaking.some(y => y !== x && pool.sees(y.hash, x.hash)));
        if (maxes.length === 1) start = maxes[0]; else line = false;
      } else {
        const acc = acceptedBy(o, thing);
        if (!acc.length) continue; // nothing is hers on the record until she answers accepted
        start = oneStartIn(pool, acc); if (!start) line = false;
      }
      firsts.push({ owner: o, start: line ? start : null, f, noLine: !line });
    }
  } else if (keeps.length === 1) {
    // produce of a thing: the first owner of what a keep makes is the owner of the thing kept, where the keep stands
    const k = keeps[0], means = pool.get(k.refs.subject);
    if (means && means.type === 'thing') {
      const r = ownershipFold(means, pool, keepView(pool, k, within), now);
      if (r.not_shown) return r;
      const os = r.owners.map(x => x.owner);
      const lone = os.length === 1;
      if (!lone) said = false;
      for (const o of os) {
        let start = null, line = true;
        if (speaker(k) === o) start = k;
        else { const acc = acceptedBy(o, thing); if (!acc.length) continue; start = oneStartIn(pool, acc); if (!start) line = false; }
        firsts.push({ owner: o, start: line ? start : null, f: lone ? (pack ? dec(pack.value) : WHOLE) : WHOLE, noLine: !line });
      }
    }
  } else {
    const sp = speaker(thing);
    if (isStr(sp)) firsts.push({ owner: sp, start: thing, f: pack ? dec(pack.value) : WHOLE });
  }
  const measure = { kind: pack ? { unit: pack.unit, of: ofId } : null, said, byUnit: true, firsts: [], adds: [] };
  for (const f of firsts) measure.firsts.push(f.noLine ? { owner: f.owner, start: null, f: f.f, key: '~' } : f);
  // ---- what draws on it (folds.md, A draw): a transfer to a named receiver or to an open one, a make that names it, a grant that passes a part of it
  const draws = [];
  const grantsOver = new Map(); // grant hash -> { owner, holder, key }
  for (const b of pool.all()) {
    if (!seen(b.hash) || voided(b, pool) || b.hash === thing.hash) continue;
    if (b.type === 'transfer' && b.state.status === undefined && b.refs.answers === undefined && asList(b.refs.what).includes(thing.hash)) {
      // DECIDED (03-amounts, What building changed): [S3-14] a block that speaks for no one (a circle's move no row holds for, an unauthorised block) is no draw: it is not listed
      const sp = speaker(b); if (!isStr(sp)) continue;
      const named = asList(b.refs.to_owner)[0], open = named === undefined && b.state.count !== undefined;
      if (named === undefined && !open) continue; // kept apart or placed only: it moves the holder or the place, not the title
      let amt = isAmount(b.state.amount) ? b.state.amount : null;
      if (isParts && amt && !/^[0-9]+$/.test(amt.value)) amt = { value: amt.value, unit: 'part\u0000fraction' }; // C1: a fraction of a part is another kind, so a draw of one takes nothing (`unit`)
      if (amt && !fpos(dec(amt.value))) continue; // a transfer of zero is no draw
      // 1.9 stage 4 (G13): a block of a tool of hers, under a grant whose types name `transfer`, that gives a part its line holds to another tool of hers passes that part; it starts on that tool's line at its accept. It gives nothing away.
      const pg = b.refs.under !== undefined ? pool.get(b.refs.under) : null;
      if (pg && pg.type === 'grant' && named !== undefined && b.refs.author !== sp && asList(pg.refs.what).includes(thing.hash) && s4IsPass(b, pg, pool) && !whyNotUnder(b, pool).length) {
        draws.push({ block: b, by: sp, to: named, amount: amt, lands: 'accept', stays: false, kind: 'pass', key: 'grant:' + pg.hash, passTool: { owner: sp, key: 'pass:' + named } });
        continue;
      }
      draws.push({ block: b, by: sp, to: named === undefined ? 'open' : named, amount: amt, shown: amt && amt.unit === 'part\u0000fraction' ? { ...b.state.amount } : undefined, lands: named === undefined ? 'stands' : 'accept', stays: named !== undefined, kind: named === undefined ? 'letgo' : 'transfer', cond: b.state.condition !== undefined ? b : undefined,
        will: named !== undefined && isObj(b.state.condition) && b.state.condition.closed === sp }); // 1.9 3d-16: a will is her own transfer on `{ closed: <her id> }`
    } else if (b.type === 'transform' && asList(b.refs.derives_from).includes(thing.hash)) {
      const sp = speaker(b); if (!isStr(sp)) continue;
      const inp = (Array.isArray(b.state.inputs) ? b.state.inputs : []).find(x => isObj(x) && x.from === thing.hash);
      const amt = inp && isAmount(inp.amount) ? inp.amount : null;
      if (amt && !fpos(dec(amt.value))) continue;
      draws.push({ block: b, by: sp, to: null, amount: amt, lands: 'at once', stays: false, kind: 'make' });
    } else if (b.type === 'promise' && b.state.status === undefined && b.refs.answers === undefined && b.refs.updates === undefined && asList(b.refs.what).includes(thing.hash) && isStr(b.refs.from) && isStr(b.refs.to) && b.refs.to !== b.refs.from) {
      // 1.9 3c-1: a block that names an instance of its signer's and a receiver is a draw on that instance, whether it is a transfer, an offer, or a yes to an order. It holds the amount it states from where its signer signs it, on his line.
      // An offer lands, or is freed, where the accept that answers it binds or does not (3c-2); its landing waits on Due (the block that performs it, a transfer `for` it).
      // 1.9 3c-1 (decided in building, 2026-11-19): only the giver's own first promise to a named receiver is the draw (an order from the buyer's side, the seller's yes to it, a counter and an open offer are not); it holds `terms.quantity` where that is an amount of the instance's unit, else all she owns of it
      const sp = speaker(b); if (!isStr(sp) || sp !== b.refs.from) continue;
      const q = pack && isObj(b.state.terms) && isAmount(b.state.terms.quantity) ? b.state.terms.quantity : null; // a whole thing (no pack) is held whole
      if (q && !fpos(dec(q.value))) continue;
      draws.push({ block: b, by: sp, to: b.refs.to, amount: q, lands: 'never', stays: false, kind: 'offer' });
    } else if (b.type === 'grant' && b.state.status === undefined && b.refs.answers === undefined && asList(b.refs.what).includes(thing.hash) && isStr(b.refs.to)) {
      // a grant that names an instance passes the part (scope.limit, else all she owns) to its holder's line (folds.md, A draw; authority.md is stage 4's)
      const sp = speaker(b); if (!isStr(sp)) continue;
      const lim = isObj(b.state.scope) && isAmount(b.state.scope.limit) ? b.state.scope.limit : null;
      const key = 'grant:' + b.hash;
      grantsOver.set(b.hash, { owner: sp, holder: b.refs.to, key });
      draws.push({ block: b, by: sp, to: b.refs.to, amount: lim && measure.said && lim.unit === measure.kind.unit ? lim : null, lands: 'never', stays: false, kind: 'grant', pass: { owner: sp, key } });
    }
  }
  // 1.9 3c-1: a transfer `for` an offer of the same signer to the same receiver performs that offer's hold: the hold is not counted twice (it is taken up by the transfer where the transfer takes)
  for (const d of draws) if (d.kind === 'transfer') { const o = draws.find(x => x.kind === 'offer' && x.by === d.by && x.to === d.to && asList(d.block.refs.for).includes(x.block.hash)); if (o) { d.performs = o; o.performedBy = d; } }
  // a make under a grant that passes a part is a draw on the grant's line, by whom the grant speaks for (toll work, or her own tool)
  for (const d of draws) {
    if (d.kind !== 'make' || d.block.refs.under === undefined) continue;
    const g = grantsOver.get(d.block.refs.under), gb = pool.get(d.block.refs.under);
    // GUESS: [S3-8] a make under a grant speaks for the owner (a tool of hers: hers from that make) only where the grant names a promise in `scope.on`, which is what a block that binds her keeps to
    // (00-shared, sentence 4); a grant with none is toll work, and the maker's make binds him alone (authority.md, Blocks that bind, is stage 4's and says nothing yet)
    // GUESS: [S3-9] a grant that names an instance in `refs.what` passes the part (`scope.limit`, else all she owns of it) to a line of its own, `grant:<hash>`; a make by the grant's holder that names the grant in
    // `refs.under` is a draw by the grantor on that line (what a tool holds for her, held on the grant's line as hers). No walk is made of that line (its start is the grant); a hand-back and a grant's end
    // (folds.md, A draw) rest on authority.md's Blocks that bind, which stage 4 writes, and are not built
    if (g && gb && d.block.refs.author === g.holder && grantLive(gb, pool, new Set(), d.block)) { d.by = g.owner; d.key = g.key; d.speaks = isObj(gb.state.scope) && gb.state.scope.on !== undefined; }
  }
  // a first use that takes what a let-go left (no draw): its speaker is the first owner of what was let go (folds.md, Ownership)
  measure.takeUp = (d, row) => {
    const takers = pool.all().filter(b => b.type === 'transform' && seen(b.hash) && b.refs.derives_from === undefined && b.refs.subject === thing.hash && counts(b, pool) && pool.sees(b.hash, d.block.hash));
    const ks = d.block.state.clocks === undefined ? null : clocksOf(d.block.state.clocks);
    let firstsOf = null;
    // 1.9 3b-4: of two blocks one came first on a clock where `needed` of its lines each hold a receipt of it before any receipt of the other. A receipt's place on its line is its time; its `at` orders nothing.
    // Until one holds, neither came first: two first takers that did not come one first: neither takes, and both are listed. 1.9 3b (decided, CORE-SET "What building changed"): a line that holds a receipt of one and none of the other shows the one first.
    if (ks) {
      // 1.9 3d-4: first on a line is read from the receipts' places (clockLine): a receipt before another where the other has it in its causal past; a line that holds a receipt of one and none of the other shows the one first
      const cameFirst = (x, y) => ks.names.filter(n => { const rx = receiptsOn(n, x.hash, pool), ry = receiptsOn(n, y.hash, pool); return rx.length > 0 && (ry.length === 0 || rx.some(a => ry.every(b => a !== b && placedBefore(pool, a, b)))); }).length >= ks.needed;
      firstsOf = takers.filter(x => !takers.some(y => y !== x && cameFirst(y, x))).sort(byHash);
    }
    if (firstsOf === null) firstsOf = earliest(takers, pool);
    return firstsOf.length === 1 && isStr(speaker(firstsOf[0])) ? { owner: speaker(firstsOf[0]), start: firstsOf[0] } : null;
  };
  const dealYes = d => dealAcceptsFor(d, pool, seen);
  // 3b-7: a block held and not read hides each id in its refs: one that names this thing leaves the answer not shown, whether or not a draw this reader read reaches it. A block held only as its header hides what its
  // key's line held at its place: one on the line of an owner of this measure, after its start, leaves the answer not shown (a pair read from two headers is the same: its branch is in `lacks`).
  {
    const hide = new Set();
    for (const e of pool.all()) if (e.type === undefined && e._body && seen(e.hash) && namedIds(e._body).includes(thing.hash)) hide.add(e.hash);
    // 3a-4: a block this reader cannot judge, held with its body, hides what its refs name (a hole only where it could reach: the lines of keys at or below its place)
    for (const e of pool.unjudged || []) if (seen(e.hash) && namedIds(e).includes(thing.hash)) hide.add(e.hash);
    const keyLines = new Set(firsts.filter(f => f.start).map(f => f.owner + '\u0000' + keyOf(f.start)));
    for (const e of pool.all()) if (e.type === undefined && !e._body && seen(e.hash) && isStr(e.refs.author)) {
      const k = signerKeyOf(e, pool);
      for (const f of firsts) if (f.start && f.owner === e.refs.author && k === keyOf(f.start) && (e.state.seq || 0) > (f.start.state.seq || 0)) hide.add(e.hash);
    }
    var hideFirst = hide;
  }
  const readSet = new Set([thing.hash]);
  const r = drawsOn(pool, measure, draws, { seen, now, dealYes, asked: thing.hash, read: readSet });
  // 3b-7: the same for the line of each receiver a draw landed to, from the block that starts her line for it: a block of that line held only as its header, after the start, could name this measure
  {
    const hide = new Set();
    const starts = r.not_shown ? [] : [...r.rows.values()].filter(row => row.landed && row.start && isStr(row.d.to)).map(row => ({ owner: row.d.to, start: row.start }));
    // and of each receiver who said yes to a draw of a pair left standing (listed in `pair`): her line holds the amount the pair leaves on no
    // one's line, so a block of it after her yes, held only as its header, could name this measure (3b-7). A draw refused `pair` that leaves no
    // pair standing holds nothing on her line, and "each word of that key it could end" is not read (CORE-SET, What building changed)
    // (end pass 2026-11-20, as the core reads it)
    if (!r.not_shown) for (const m of r.pairs.flatMap(p => p.members)) if (m.yes && isStr(m.to)) {
      for (const a of pool.all()) if (a.type !== undefined && a.refs.answers === m.draw && a.state.status === 'accepted' && a.refs.author === m.to && seen(a.hash)) starts.push({ owner: m.to, start: a });
    }
    for (const e of pool.all()) if (e.type === undefined && !e._body && seen(e.hash) && isStr(e.refs.author)) {
      const k = signerKeyOf(e, pool);
      for (const f of starts) if (f.owner === e.refs.author && k === keyOf(f.start) && (e.state.seq || 0) > (f.start.state.seq || 0)) hide.add(e.hash);
    }
    for (const h of hideFirst) hide.add(h);
    if (hide.size || r.not_shown) {
      const lacks = [...(r.not_shown ? r.lacks : [])];
      for (const h of [...hide].sort()) if (!lacks.includes(h)) lacks.push(h);
      const ids = lacks.filter(x => typeof x === 'string').sort(), rest = lacks.filter(x => typeof x !== 'string');
      return { not_shown: true, lacks: r.not_shown && !hide.size ? r.lacks : [...ids, ...rest] };
    }
  }
  const kindOut = pack ? { unit: pack.unit, of: ofId } : null;
  const unitK = pack ? { unit: pack.unit } : null;
  // every sum is an amount of the measure's kind; one whole has no kind, so no sum of it is said (null); an owner of a whole, or of an amount not said, has `amount` null
  const sum = f => (pack ? amtOut(f, unitK) : null);
  const owners = [...r.owners.entries()].filter(([, f]) => fpos(f)).sort((a, b) => cmp(a[0], b[0])).map(([owner, f]) => ({ owner, amount: said ? amtOut(f, unitK) : null }));
  const letGo = r.letGo;
  // the one owner: the only one shown, while nothing is held and nothing let go waits for a first use (what a make ended is gone, not held)
  const noneHeld = !r.entries.some(e => e.takes && e.state === 'held' && !e.will) && !fpos(letGo); // 1.9 3d-16: a will in life holds nothing: the owner is still shown
  const whole = owners.length === 1;
  const entries = r.entries.map(e => { const row = r.rows.get(e.block); if (row && row.takes) Object.defineProperty(e, 'took', { value: row.amount, enumerable: false }); return e; });
  // 3b-9: an instance on a pair answers `pair: [{ draw, to, yes }]` and no owner; every answer names the blocks it read (`read`, sorted ids)
  const pair = r.pairs.flatMap(p => p.members).sort((x, y) => cmp(x.draw, y.draw));
  // 3b-10: `named_by` [{ block, by, own, pair, ref }], sorted by block: each block the reader holds that names this thing, or a draw this answer lists, by any ref, other than the draws and yeses this answer already lists;
  // whom it speaks for (`by`); whether it is backed by whom the named draw spoke for (`own`); whether it is one of a pair (`pair`); the ref that names it. A word is listed whether or not it counts.
  // 1.9 3b-10: for a block that names the thing itself, `own` is read against the thing's own speaker; one entry per block, `ref` the first ref key in byte order that names it (never
  // `author`, `prev`, `key` or `after`); the yeses left out are each receiver's own `accepted` answer to a listed draw (the answer reports them in `state` and `pair`)
  const listed = new Set([thing.hash, ...entries.map(e => e.block)]);
  for (const row of r.rows.values()) for (const y of row.yes || []) listed.add(y.hash);
  const drawBy = new Map(entries.map(e => [e.block, e.by])), drawTo = new Map(entries.map(e => [e.block, e.to]));
  const inPair = new Set(forkPairs(pool).flat());
  const namedBy = [];
  for (const b of pool.all()) {
    if (b.type === undefined || listed.has(b.hash) || !seen(b.hash)) continue;
    const by = speakerOf(b, pool);
    let hit = null;
    for (const k of Object.keys(b.refs).sort()) {
      if (['author', 'prev', 'key', 'after'].includes(k)) continue;
      const id = asList(b.refs[k]).find(x => x === thing.hash || drawBy.has(x));
      if (id !== undefined) { hit = [k, id]; break; }
    }
    if (!hit) continue;
    const [k, id] = hit;
    if (k === 'answers' && b.state.status === 'accepted' && isStr(by) && drawTo.get(id) === by) continue;
    const target = id === thing.hash ? speakerOf(thing, pool) : drawBy.get(id);
    namedBy.push({ block: b.hash, by: by === undefined ? null : by, own: isStr(by) && by === target, pair: inPair.has(b.hash), ref: k });
  }
  namedBy.sort((x, y) => cmp(x.block, y.block));
  // 1.9 3b-9: `read` names the thing, the block that starts each owner's line for it, each draw listed, and each yes that landed one (not the blocks a line was walked through)
  readSet.clear(); readSet.add(thing.hash);
  for (const f of firsts) if (f.start) readSet.add(f.start.hash);
  for (const e of entries) readSet.add(e.block);
  for (const row of r.rows.values()) { if (row.landed && row.start) readSet.add(row.start.hash); if (row.landed) { const ys = row.yes || [], direct = y => asList(y.refs.answers).includes(row.d.block.hash); for (const y of ys) if (!direct(y) || !ys.some(o => o !== y && direct(o) && pool.past(y.hash).has(o.hash))) readSet.add(y.hash); } if (row.takenUp && row.takenUp.start) readSet.add(row.takenUp.start.hash); }
  return { kind: kindOut, stated: pack ? { ...pack } : null, owners, owner: noneHeld && whole && !pair.length ? owners[0].owner : null, held: sum(r.held), ended: sum(r.ended), let_go: sum(letGo), draws: entries, waiting: r.waiting, pair, named_by: namedBy, read: [...readSet].sort() };
}
// her yes by the deal a draw is `for` (folds.md, Lands): her own counted accepted answer to the deal's first promise, or her own first promise that the
// draw's signer accepted, in the draw's own causal past. Read from the blocks themselves, never from the deal's stage (which reads this fold): no loop.
function dealAcceptsFor(d, pool, seen) {
  const out = [], past = pool.past(d.block.hash);
  for (const fh of asList(d.block.refs.for)) {
    const first = pool.get(fh);
    if (!first || first.type !== 'promise' || first.refs.answers !== undefined || !past.has(fh)) continue;
    const answers = pool.all().filter(a => seen(a.hash) && a.type === 'promise' && a.state.status === 'accepted' && asList(a.refs.answers).includes(fh) && past.has(a.hash) && counts(a, pool));
    for (const a of answers) if (speakerOf(a, pool) === d.to && !out.includes(a)) out.push(a);
    if (first.state.status === undefined && speakerOf(first, pool) === d.to && answers.some(a => speakerOf(a, pool) === d.by)) out.push(first);
    // 1.9 stage 5 (R-P5): a buyer's order is her yes to the seller's transfer `for` it that names its instance: the seller's transfer is his yes and his delivery in one block, and lands where it is signed
    else if (first.state.status === undefined && speakerOf(first, pool) === d.to && first.refs.to === d.to && first.refs.from === d.by && d.block.type === 'transfer' && d.block.state.covers !== undefined && asList(first.refs.what).some(h => asList(d.block.refs.what).includes(h))) out.push(first);
  }
  return out;
}
// the transfers whose condition is being read, so a condition that leads back to the transfer carrying it holds for nothing instead of looping
const reading = new Set();
function conditionHolds1(t, pool, seen, now) {
  if (reading.has(t.hash)) return false;
  reading.add(t.hash);
  try { return conditionHolds(t.state.condition, pool.all().filter(b => seen(b.hash)), now) === true; } finally { reading.delete(t.hash); }
}
const conditionStands = (t, pool, seen, now) => t.state.condition === undefined || (conditionHolds1(t, pool, seen, now) && !letGo(t, pool, seen));
// a conditioned transfer its receiver let go: her own counted stopped or declined answer to it, signed before the condition held (read on what that
// answer saw, at its own date); it binds only her
function letGo(t, pool, seen) {
  if (t.state.condition === undefined) return false;
  const heldAt = (a) => {
    if (reading.has(t.hash)) return false;
    const past = pool.past(a.hash);
    reading.add(t.hash);
    try { return conditionHolds(t.state.condition, pool.all().filter(b => past.has(b.hash) && seen(b.hash)), isStr(a.state.at) ? a.state.at : '') === true; } finally { reading.delete(t.hash); }
  };
  return pool.all().some(a => ((a.type === 'transfer' && (a.state.status === 'stopped' || a.state.status === 'declined')) || isDeclineReading(a)) && seen(a.hash) && a.refs.answers === t.hash && counts(a, pool) &&
    asList(t.refs.to_owner).includes(speakerOf(a, pool)) && !heldAt(a));
}
// made_from(instance, held): each thing written as an output of a counted make that took from it, and so on along the makes (folds.md, What each fold returns). A reading of what the
// reader holds; { not_shown, lacks } when a line it reads is not read whole.
// DECIDED (03-amounts, What building changed): [S3-34] an output of a make is a thing written by the make's author that names it in `derives_from`; `took` is what the make's draw states (null for all)
function madeFromList(thingIn, blocks) {
  const pool = withThing(thingIn, blocks), root = pool.get(typeof thingIn === 'string' ? thingIn : thingIn.hash);
  if (!root) return [];
  const out = [], done = new Set(), queue = [root.hash];
  while (queue.length) {
    const x = queue.shift();
    if (done.has(x)) continue; done.add(x);
    const r = ownershipFold(x, pool);
    if (r.not_shown) return r;
    for (const e of r.draws) {
      if (!e.takes) continue;
      const m = pool.get(e.block);
      if (!m || !isMakeBlock(m) || !counts(m, pool)) continue;
      const took = e.took ? (e.amount ? e.amount : (r.stated ? amtOut(e.took, { unit: r.stated.unit }) : null)) : null;
      for (const o of pool.all()) if (o.type === 'thing' && asList(o.refs.derives_from).includes(m.hash) && o.refs.author === m.refs.author) { out.push({ thing: o.hash, from: x, make: m.hash, took: e.amount ? e.amount : null }); queue.push(o.hash); }
    }
  }
  return out.sort((a, b) => cmp(a.thing, b.thing) || cmp(a.make, b.make));
}
// the amount of an instance that passed through one author's hands, and that a word of hers about it therefore reaches (things.md, Parts): the author of the make or first use it came
// from speaks of it whole; any other author, of the amount his own draws handed on (landed or held for a receiver that has not said no). A reading, never a rule.
// DECIDED (03-amounts, What building changed): [S3-31] the reach of a word about an instance (things.md, Parts) is a reading with no door op: whole for the author of a make or first use it came from (and the author of the thing), else the amount that
// author's own draws handed on and that landed
function reachOfWord(thingIn, author, blocks) {
  const pool = withThing(thingIn, blocks), thing = pool.get(typeof thingIn === 'string' ? thingIn : thingIn.hash);
  const r = ownershipFold(thing, pool);
  if (r.not_shown) return r;
  const makers = asList(thing.refs.derives_from).map(h => pool.get(h)).filter(m => m && m.type === 'transform' && m.refs.author === author);
  if (makers.length || thing.refs.author === author) return { whole: true, amount: r.stated ? { ...r.stated } : null };
  let f = F0;
  for (const e of r.draws) { const b = pool.get(e.block); if (e.takes && e.state === 'landed' && b && b.type === 'transfer' && (b.refs.author === author || speakerOf(b, pool) === author)) f = fadd(f, e.took); }
  return { whole: false, amount: r.stated ? amtOut(f, { unit: r.stated.unit }) : { value: fPrint(f), unit: 'whole' } };
}
function whereNow(thingIn, blocks, seen) {
  const pool = withThing(thingIn, blocks);
  const thing = typeof thingIn === 'string' ? pool.get(thingIn) : pool.get(thingIn.hash) || thingIn;
  seen = seen || new Set();
  if (seen.has(thing.hash) || seen.size >= READ_DEPTH) return [];
  seen = new Set([...seen, thing.hash]);
  // a move counts when its signer owned the thing where that move stands (the ownership fold of its causal past, as promises.md, Bearer), or
  // holds it for one who did (folds.md, Where a thing is now; decision F7). A transfer of an amount moves no place (things.md, Transfers).
  const ownedBySigner = t => { const sp = speakerOf(t, pool); return sp != null && ownershipFold(thing, pool, pool.past(t.hash)).owners.some(o => o.owner === sp); };
  const holders = new Set();
  const moves = pool.all().filter(t => t.type === 'transfer' && t.refs.answers === undefined && asList(t.refs.what).includes(thing.hash) && counts(t, pool) && t.state.amount === undefined);
  for (const t of moves) if (t.refs.to_holder !== undefined && ownedBySigner(t)) holders.add(t.refs.to_holder);
  const placed = moves.filter(t => t.refs.to_place !== undefined && (ownedBySigner(t) || holders.has(speakerOf(t, pool))));
  const maximal = latest(placed, pool);
  const direct = maximal.length ? [...new Set(maximal.map(t => t.refs.to_place))] : (thing.refs.place !== undefined ? [thing.refs.place] : []);
  const res = new Set();
  for (const p of direct) {
    const pb = pool.get(p);
    const sub = pb ? whereNow(pb, pool, seen) : [];
    if (sub.length) sub.forEach(x => res.add(x)); else res.add(p);
  }
  return [...res].sort();
}
// who holds a thing (folds.md, Where a thing is now): a reading, never a rule. The receiver of the latest counted to_holder transfer of it, signed by its owner or by a holder she
// named, that the receiver accepted; else its owner. A node may compute it; no draw, title or stage reads it.
// DECIDED (03-amounts, What building changed): [S3-32] who holds it: the latest (a causal maximum) counted to_holder transfer of it, signed by an owner or by a holder, that the receiver accepted; several maxima or none fall back to the owner
function holderOf(thingIn, blocks) {
  const pool = withThing(thingIn, blocks), thing = pool.get(typeof thingIn === 'string' ? thingIn : thingIn.hash);
  const own = ownershipFold(thing, pool);
  if (own.not_shown) return own;
  const owners = new Set(own.owners.map(o => o.owner));
  const ok = [], holders = new Set(), done = new Set();
  const moves = pool.all().filter(t => t.type === 'transfer' && t.state.status === undefined && t.refs.answers === undefined && asList(t.refs.what).includes(thing.hash) && t.refs.to_holder !== undefined && counts(t, pool));
  for (let changed = true; changed;) {
    changed = false;
    for (const t of moves) {
      if (done.has(t.hash)) continue;
      const sp = speakerOf(t, pool), to = asList(t.refs.to_holder)[0];
      if (!(owners.has(sp) || holders.has(sp))) continue;
      if (!pool.all().some(a => a.state.status === 'accepted' && asList(a.refs.answers).includes(t.hash) && counts(a, pool) && speakerOf(a, pool) === to)) continue;
      done.add(t.hash); ok.push(t); holders.add(to); changed = true;
    }
  }
  const heads = latest(ok, pool);
  return heads.length === 1 ? asList(heads[0].refs.to_holder)[0] : (own.owner === null ? null : own.owner);
}

// ================================================================ shares and uses (things.md, Shares; Uses of a place)
// the shares that stand on an instance or a place: things of kind share naming it in refs.subject, made by whoever owned it where the share stands;
// nothing when the subject is no thing, is a kind (some thing names it in refs.of), or was not its maker's
function sharesOn(thingIn, blocks) {
  const pool = withThing(thingIn, blocks);
  const thing = pool.get(typeof thingIn === 'string' ? thingIn : thingIn.hash);
  if (!thing) return { standing: [], nothing: [] }; // a block no node would take is no thing
  const isKind = !isInstance(thing); // a kind is a kind by its own block (things.md, Things): no stranger's refs.of makes an instance one
  const standing = [], nothing = [];
  const shares = pool.all().filter(b => b.type === 'thing' && b.state.kind === 'share' && b.refs.subject === thing.hash && counts(b, pool)).sort((a, b) => (a.hash < b.hash ? -1 : 1));
  for (const s of shares) {
    let reason = null;
    if (thing.type !== 'thing') reason = 'not_a_thing';
    else if (isKind) reason = 'kind';
    else { const maker = speakerOf(s, pool); if (maker === null || !ownershipFold(thing, pool, pool.past(s.hash)).owners.some(o => o.owner === maker)) reason = 'not_owner'; }
    if (reason) nothing.push({ share: s.hash, reason }); else standing.push({ share: s.hash, owner: ownershipFold(s, pool).owner });
  }
  return { standing, nothing };
}
// a bound: a polygon, one closed ring of [lon, lat] decimal strings of at most nine places, in billionths of a degree
const GEO = 10n ** 9n;
function micro(t) {
  if (!isStr(t) || !RX.decimal.test(t)) return null;
  const neg = t.startsWith('-'), [w, f = ''] = t.replace(/^-/, '').split('.');
  if (f.length > 9) return null;
  const n = BigInt(w + f.padEnd(9, '0'));
  return neg ? -n : n;
}
function ringOf(b) {
  if (!isObj(b) || Object.keys(b).length !== 2 || b.type !== 'Polygon' || !Array.isArray(b.coordinates) || b.coordinates.length !== 1 || !Array.isArray(b.coordinates[0]) || b.coordinates[0].length > P.limits.bound_points) return null;
  const ring = [];
  for (const p of b.coordinates[0]) {
    if (!Array.isArray(p) || p.length !== 2) return null;
    const lon = micro(p[0]), lat = micro(p[1]);
    if (lon === null || lat === null || (lon < 0n ? -lon : lon) > 180n * GEO || (lat < 0n ? -lat : lat) > 90n * GEO) return null;
    ring.push([lon, lat]);
  }
  const f = ring[0], l = ring[ring.length - 1];
  return ring.length >= 4 && f[0] === l[0] && f[1] === l[1] ? ring : null;
}
const crossP = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
const sgn = x => (x > 0n ? 1 : x < 0n ? -1 : 0);
const properX = (a, b, c, d) => sgn(crossP(a, b, c)) * sgn(crossP(a, b, d)) < 0 && sgn(crossP(c, d, a)) * sgn(crossP(c, d, b)) < 0;
const mn = (x, y) => (x < y ? x : y), mx = (x, y) => (x > y ? x : y);
const onEdge = (p, a, b) => crossP(a, b, p) === 0n && p[0] >= mn(a[0], b[0]) && p[0] <= mx(a[0], b[0]) && p[1] >= mn(a[1], b[1]) && p[1] <= mx(a[1], b[1]);
function strictlyInside(p, ring) {
  let c = false;
  for (let i = 0; i + 1 < ring.length; i++) {
    const a = ring[i], b = ring[i + 1];
    if (onEdge(p, a, b)) return false;
    if ((a[1] > p[1]) !== (b[1] > p[1])) {
      const lhs = (p[0] - a[0]) * (b[1] - a[1]), rhs = (b[0] - a[0]) * (p[1] - a[1]);
      if ((b[1] > a[1] && lhs < rhs) || (b[1] < a[1] && lhs > rhs)) c = !c;
    }
  }
  return c;
}
// two bounds overlap when they share area, not only a border
function boundsOverlap(a, b) {
  const dbl = r => r.map(p => [p[0] * 2n, p[1] * 2n]), mids = r => r.slice(1).map((p, i) => [r[i][0] + p[0], r[i][1] + p[1]]);
  const A = dbl(a), B = dbl(b);
  for (let i = 0; i + 1 < A.length; i++) for (let j = 0; j + 1 < B.length; j++) if (properX(A[i], A[i + 1], B[j], B[j + 1])) return true;
  if (A.some(p => strictlyInside(p, B)) || B.some(p => strictlyInside(p, A))) return true;
  if (mids(a).some(p => strictlyInside(p, B)) || mids(b).some(p => strictlyInside(p, A))) return true;
  const key = r => [...new Set(r.map(p => p[0] + ',' + p[1]))].sort().join(';');
  return key(a) === key(b);
}
// what use of a place the record shows: counted transforms that make nothing from anything, naming the place in refs.subject, with state.use what was done;
// dated by the named clock's receipts when clocks are given (a use not received is not dated), else by the author's own at
// a use by leave (things.md, Uses of a place): the owner's grant of kind leave, to the user, about the place, signed by whoever owned the place where the grant
// stands and not stopped by its author; it never ripens: "by leave of X since D", never a use that stands against X
function leaveOf(user, place, pool) {
  const found = pool.all().filter(g => g.type === 'grant' && g.state.kind === 'leave' && g.state.status === undefined && g.refs.to === user && g.refs.subject === place.hash && counts(g, pool) &&
    speakerOf(g, pool) !== null && ownershipFold(place, pool, pool.past(g.hash)).owner === speakerOf(g, pool) && grantLive(g, pool))
    .sort((a, b) => (isStr(a.state.at) ? a.state.at : '') < (isStr(b.state.at) ? b.state.at : '') ? -1 : (isStr(a.state.at) ? a.state.at : '') > (isStr(b.state.at) ? b.state.at : '') ? 1 : cmp(a.hash, b.hash));
  if (!found.length) return null;
  const g = found[0];
  return { of: speakerOf(g, pool), since: isStr(g.state.at) ? g.state.at : null, until: g.state.scope && g.state.scope.until !== undefined ? g.state.scope.until : null };
}
function useShown(placeIn, blocks, clocks) {
  const pool = withThing(placeIn, blocks);
  const place = pool.get(typeof placeIn === 'string' ? placeIn : placeIn.hash);
  const ks = clocks === undefined || clocks === null ? null : clocksOf(clocks);
  const by = new Map();
  const records = [];
  for (const b of pool.all()) {
    if (b.type !== 'transform' || b.refs.derives_from !== undefined || b.refs.subject !== place.hash || !isStr(b.state.use) || !counts(b, pool)) continue;
    const user = speakerOf(b, pool); if (user === null) continue;
    const date = ks ? receivedAt(b.hash, ks, pool) : (isStr(b.state.at) ? b.state.at : null);
    records.push({ hash: b.hash, user, date });
    if (!by.has(user)) by.set(user, { uses: new Set(), dates: [], bounds: new Map(), resting: null, unreceived: 0, layers: new Set() });
    const u = by.get(user);
    u.uses.add(b.state.use);
    if (isStr(b.state.layer)) u.layers.add(b.state.layer);
    if (date === null) u.unreceived++; else u.dates.push(date);
    const ring = b.state.bound === undefined ? null : ringOf(b.state.bound);
    if (ring) u.bounds.set(JSON.stringify(b.state.bound.coordinates), ring);
    if (isStr(b.state.resting) && (u.resting === null || u.resting < b.state.resting)) u.resting = b.state.resting;
  }
  const names = [...by.keys()].sort();
  const users = names.map(name => {
    const u = by.get(name), dates = [...u.dates].sort();
    const keys = [...u.bounds.keys()].sort();
    return { user: name, uses: [...u.uses].sort(), count: dates.length, unreceived: u.unreceived, first: dates.length ? dates[0] : null, last: dates.length ? dates[dates.length - 1] : null,
      seasons: new Set(dates.map(d => d.slice(0, 4))).size, bounds: keys.map(k => JSON.parse('{"type":"Polygon","coordinates":' + k + '}')), resting: u.resting,
      overlaps: names.filter(o => o !== name && [...by.get(o).bounds.values()].some(rb => [...u.bounds.values()].some(ra => boundsOverlap(ra, rb)))),
      layers: [...u.layers].sort(),
      overlap_uses: names.filter(o => o !== name && [...by.get(o).bounds.values()].some(rb => [...u.bounds.values()].some(ra => boundsOverlap(ra, rb)))).map(o => ({ with: o, use: [...by.get(o).uses].some(a => u.uses.has(a)) ? 'same' : 'different' })),
      leave: leaveOf(name, place, pool) };
  });
  // a dispute of a first-use record (things.md, Uses of a place): a counted defeats of a use record, beside which the fold shows its standing
  const disputes = [];
  for (const d of pool.all()) {
    if (!counts(d, pool)) continue;
    const defender = speakerOf(d, pool); if (defender === null) continue;
    for (const r of records) {
      if (!asList(d.refs.defeats).includes(r.hash)) continue;
      const cited = asList(d.refs.derives_from);
      const earlier = records.some(o => cited.includes(o.hash) && o.user === defender && o.hash !== r.hash && o.date !== null && r.date !== null && o.date < r.date);
      const title = cited.some(h => { const t = pool.get(h); return !!t && t.type === 'transfer' && asList(t.refs.what).includes(place.hash) && asList(t.refs.to_owner).includes(defender) && counts(t, pool); });
      disputes.push({ defeats: d.hash, by: defender, of: r.hash, user: r.user, standing: earlier ? 'earlier_use' : title ? 'title' : 'none' });
    }
  }
  disputes.sort((a, b) => cmp(a.defeats, b.defeats) || cmp(a.of, b.of));
  return { clock: ks ? 'clocks' : 'author', users, disputes };
}


// ================================================================ the signer's word and the claim of invasion (promises.md, Disputes)
// the words beside a block: an observe of kind not_free naming it in refs.subject, counting as hers only when written by the block's author
function notFreeShown(blockIn, blocks) {
  const pool = withThing(blockIn, blocks);
  const block = pool.get(typeof blockIn === 'string' ? blockIn : blockIn.hash) || blockIn;
  const words = pool.all().filter(b => b.type === 'observe' && b.state.kind === 'not_free' && b.state.status === undefined && b.refs.subject === block.hash && counts(b, pool)).sort(byHash);
  const shown = [], nothing = [];
  for (const n of words) {
    if (isStr(block.refs.author) && backedIn(n, block.refs.author, pool).backed) shown.push({ block: n.hash, by: n.refs.author, reason: isStr(n.state.reason) ? n.state.reason : null, threat: isStr(n.state.threat) ? n.state.threat : null, at: isStr(n.state.at) ? n.state.at : null });
    else nothing.push({ block: n.hash, why: 'not_signer' });
  }
  return { shown, nothing };
}
// who holds a claim now: the claimant, then each hand-over (a transfer naming the claim in refs.what, signed by the holder where it stands, accepted by the new holder, and signed
// twice: blocks.md, Finality). A claim is one whole (folds.md, What is left); a hand-over is a draw on it. Two by one holder that do not see each other are a pair, and neither moves it.
function claimHolder(claim, claimant, pool) {
  const draws = [];
  for (const t of pool.all()) {
    if (t.type !== 'transfer' || t.state.status !== undefined || t.refs.answers !== undefined || !asList(t.refs.what).includes(claim.hash) || t.refs.to_owner === undefined || voided(t, pool) || !pool.sees(t.hash, claim.hash)) continue;
    const sp = speakerOf(t, pool); if (!isStr(sp)) continue;
    draws.push({ block: t, by: sp, to: asList(t.refs.to_owner)[0], amount: null, lands: 'accept', stays: true, kind: 'transfer' });
  }
  const r = drawsOn(pool, { kind: null, said: false, byUnit: false, firsts: [{ owner: claimant, start: claim, f: WHOLE }], adds: [] }, draws, { seen: () => true });
  if (r.not_shown) return claimant;
  const owners = [...r.owners.entries()].filter(([, f]) => fpos(f)).map(([o]) => o);
  // DECIDED (03-amounts, What building changed): [S3-15] who holds a claim now: the one owner of the claim (a hand-over that landed); else, while a hand-over is held or a pair stands, the owner it was drawn from; else the claimant
  if (owners.length === 1) return owners[0];
  const by = [...new Set(r.entries.filter(e => e.takes).map(e => e.by))];
  return by.length === 1 ? by[0] : claimant;
}
function invasionShown(claimIn, blocks) {
  // 1.9-GUESS [5-29] 1.9 stage 5 (section 7, R-J5): a claim is its signer's word that something is hers, or that she or what is hers was crossed: an `observe` naming in `refs.subject` what it is about, in `refs.to` whom she says did it or holds it, in `refs.derives_from` what she shows.
  // No fold reads its truth. `standing`, `crossed`, `commanded`, `accused`, `nothing` and `up_to` are gone: what is shown is who speaks, who holds it now, the evidence, the judges named for it and their words.
  const pool = withThing(claimIn, blocks);
  const claim = pool.get(typeof claimIn === 'string' ? claimIn : claimIn.hash) || claimIn;
  if (claim.type !== 'observe' || claim.state.kind !== 'invasion') return null;
  const ch = claim.hash;
  const claimant = speakerOf(claim, pool);
  const accused = [...new Set(asList(claim.refs.to))].sort();
  const evidence = [...new Set(asList(claim.refs.derives_from))].sort();
  const holder = claimant === null ? null : claimHolder(claim, claimant, pool);
  const sideOfClaim = w => claimant === w || holder === w;
  const isAccused = w => accused.includes(w);
  const named = [];
  for (const g of pool.all().filter(g => g.type === 'grant' && g.state.kind === 'referee' && g.state.status === undefined && g.refs.subject === ch && counts(g, pool))) {
    const judge = g.refs.to, signer = speakerOf(g, pool);
    if (!isStr(judge) || signer === null) continue;
    if (!(sideOfClaim(signer) || isAccused(signer))) continue;
    if (sideOfClaim(judge) || isAccused(judge)) continue;
    named.push({ judge, signer, grant: g.hash });
  }
  const judgeKeys = [...new Set(named.map(n => n.judge + '\u0000' + n.signer))].sort();
  const judges = judgeKeys.map(k => { const [judge, signer] = k.split('\u0000'); return { judge, signer }; });
  const rulings = [];
  for (const r of pool.all().filter(r => counts(r, pool))) {
    for (const word of ['confirms', 'defeats']) {
      if (!asList(r.refs[word]).includes(ch)) continue;
      const signer = r.refs.author; if (!isStr(signer)) continue;
      // the judge is whom the ruling speaks for: a circle named as judge rules by its holders of sign, signing as it (circles.md)
      const sp = speakerOf(r, pool);
      const author = sp !== null ? sp : signer;
      if (sideOfClaim(signer) || isAccused(signer) || sideOfClaim(author) || isAccused(author)) continue;
      const by = [...new Set(judges.filter(j => j.judge === author).map(j => j.signer))].sort();
      if (!by.length) continue;
      rulings.push({ block: r.hash, judge: author, named_by: by, word, evidence: [...new Set(asList(r.refs.derives_from))].sort() });
    }
  }
  rulings.sort((a, b) => cmp(a.block, b.block) || cmp(a.word, b.word));
  return { claimant, holder, evidence, judges: judges.map(j => ({ judge: j.judge, named_by: j.signer })), rulings };
}


// ================================================================ a pot (folds.md, A pot)
function signalBy(c) {
  if (!isObj(c)) return null;
  if (c.signal !== undefined && Array.isArray(c.by)) return c.by.filter(isStr);
  const inner = c.within !== undefined ? c.within : c.without;
  return inner === undefined ? null : signalBy(inner);
}
// A pot is one measure whose owner is the holder (whom the head speaks for): `terms.backing` her own word, an amount, plus the pay-ins she accepted. A payout is a draw on it.
function potFold(headIn, blocks, now) {
  const pool = withThing(headIn, blocks);
  // a fold reads only what is valid and read (folds.md): a head not held as a valid block is no pot
  const head = pool.get(typeof headIn === 'string' ? headIn : headIn.hash);
  if (!head || head.type !== 'promise' || head.refs.answers !== undefined) return null;
  const holder = speakerOf(head, pool); if (holder === null) return null;
  // 1.9 3b-7 (Answers: ownership, pot): a block held and not read that could name the pot hides it; one held only as its header on the
  // holder's line after the head could name it too. The answer is not shown, those blocks in `lacks` (end pass 2026-11-20, as the core reads it)
  {
    const hide = new Set();
    for (const e of pool.all()) if (e.type === undefined && e._body && namedIds(e._body).includes(head.hash)) hide.add(e.hash);
    for (const e of pool.unjudged || []) if (namedIds(e).includes(head.hash)) hide.add(e.hash);
    for (const e of pool.all()) if (e.type === undefined && !e._body && isStr(e.refs.author) && e.refs.author === head.refs.author && signerKeyOf(e, pool) === keyOf(head) && (e.state.seq || 0) > (head.state.seq || 0)) hide.add(e.hash);
    if (hide.size) return { not_shown: true, lacks: [...hide].sort() };
  }
  const terms = isObj(head.state.terms) ? head.state.terms : {};
  const backing = isAmount(terms.backing) ? terms.backing : null;
  const noLimit = backing === null && terms.cap === 'all';
  // 1.9-GUESS [3e-1]: the holder's accept of a pay-in is his word that the money came ("paid only by the payee's word"), and a block of a fork binds its signer as what he owes (Rule B, folds.md A fork is a burden): a pay-in he accepted by a block of a fork counts (it binds him). The pot's holder never gains by it: it is backing he must pay out
  const acceptsOf = t => pool.all().filter(a => a.type === 'transfer' && a.state.status === 'accepted' && asList(a.refs.answers).includes(t.hash) && binds(a, pool) && asList(t.refs.to_owner).includes(speakerOf(a, pool)) && answerStands(t, a, pool));
  const base = t => t.type === 'transfer' && t.state.status === undefined && t.refs.answers === undefined && asList(t.refs.for).length === 1 && asList(t.refs.for)[0] === head.hash && counts(t, pool) && pool.sees(t.hash, head.hash);
  // the pay-ins: transfers for the head to_owner the holder, each counted for a payout when her accept of it is in the payout's causal past
  const ins = pool.all().filter(t => base(t) && isAmount(t.state.amount) && t.refs.to_owner === holder && t.refs.what === undefined && acceptsOf(t).length).sort(byHash);
  // the pot's kind: the backing's; with none, the one kind every accepted pay-in shares; else it has none and pays nothing out
  let kind = null;
  if (backing) kind = kindOf(backing);
  else if (ins.length && ins.every(t => sameKind(t.state.amount, ins[0].state.amount))) kind = kindOf(ins[0].state.amount);
  // with a cap of `all` and neither, the one kind the holder's own payouts share (her word states it); several: none
  else if (!ins.length && noLimit) {
    const outs = pool.all().filter(t => base(t) && isAmount(t.state.amount) && t.refs.what === undefined && asList(t.refs.to_owner).length === 1 && t.refs.to_owner !== holder);
    if (outs.length && outs.every(t => sameKind(t.state.amount, outs[0].state.amount))) kind = kindOf(outs[0].state.amount);
  }
  const schema = isStr(head.refs.schema) ? pool.get(head.refs.schema) : null;
  const confirmers = schema && isObj(schema.state.grounds) ? asList(schema.state.grounds.confirmers) : [];
  // a vouch to whoever holds a lot (promises.md, Bearer): when the head's receiver is a thing, a payout counts as the claim of its owner where the payout stands
  const lot = isStr(head.refs.to) && pool.get(head.refs.to) && pool.get(head.refs.to).type === 'thing' ? head.refs.to : null;
  const made = lot === null ? null : madeFromList(lot, pool);
  const draws = [], listed = [];
  for (const t of pool.all().filter(base)) {
    const to = asList(t.refs.to_owner);
    if (!isAmount(t.state.amount) || to.length !== 1 || to[0] === holder || t.refs.what !== undefined || speakerOf(t, pool) !== holder) continue;
    if (!fpos(dec(t.state.amount.value))) continue; // a payout of zero is no draw
    const by = t.state.condition === undefined ? null : signalBy(t.state.condition);
    let why = null;
    if (confirmers.length && !(by && by.length && by.every(b => confirmers.includes(b)))) why = 'not_confirmed';
    else if (lot !== null) {
      if (made.not_shown) return made;
      const past = pool.past(t.hash), parts = [lot, ...made.map(x => x.thing)];
      if (!parts.some(x => (x === lot || past.has(x)) && ownershipFold(x, pool, past).owners.some(o => o.owner === to[0]))) why = 'not_holder';
    }
    // neither takes or holds anything of the pot: it is the holder's own word from her own goods
    if (why) { listed.push({ block: t.hash, by: holder, to: to[0], amount: { ...t.state.amount }, takes: false, why, state: null }); continue; }
    draws.push({ block: t, by: holder, to: to[0], amount: t.state.amount, lands: 'accept', stays: false, kind: 'payout', cond: t.state.condition !== undefined ? t : undefined });
  }
  // DECIDED (03-amounts, What building changed): [S3-16] a pot with no kind (two kinds of pay-in and no backing, or nothing) gives null sums and every payout reads `unit`; a pot with a kind and no backing states `backing` 0; a pot whose cap is `all` takes every payout
  const measure = { kind, said: !!kind, noKind: !kind, byUnit: false, unlimited: noLimit, firsts: [{ owner: holder, start: head, f: backing ? dec(backing.value) : F0 }],
    // DECIDED (03-amounts, What building changed): [S3-17] a pay-in counts for a payout when the holder's accept of it, by any key of hers, is in the payout's causal past (the accept hashes are the pay-in's `at`)
    adds: kind ? ins.filter(t => sameKind(t.state.amount, kind)).map(t => ({ owner: holder, f: dec(t.state.amount.value), at: acceptsOf(t).map(a => a.hash) })) : [] };
  const r = drawsOn(pool, measure, draws, { seen: () => true, now });
  if (r.not_shown) return { not_shown: true, lacks: r.lacks };
  let paidOut = F0;
  for (const row of r.rows.values()) if (row.takes && row.landed) paidOut = fadd(paidOut, row.amount);
  const paidIn = fsumF(measure.adds.map(a => a.f));
  const out = f => (kind ? amtOut(f, kind) : null);
  const left = r.owners.get(holder) || F0;
  const payouts = [...r.entries, ...listed].sort((a, b) => cmp(a.block, b.block));
  return { holder, kind: kind ? { ...kind } : null, backing: noLimit ? null : backing ? { ...backing } : kind ? out(F0) : null, paid_in: out(paidIn), held: out(r.held), paid_out: out(paidOut), left: noLimit ? null : out(left), cap: noLimit ? 'all' : null, payouts };
}

// ================================================================ consent and admission (consent.md)
// namesOf(sender, block, pool): who a sender is named by (consent follows the principal): itself, and whom its block speaks for
// (folds.md, Who a block speaks for: the one speaker rule, scope included). Without the sender's block, itself alone.
function namesOf(sender, block, pool) {
  const out = [sender];
  if (block && block.refs && block.refs.author === sender) {
    const p = speakerOf(block, pool.get(block.hash) ? pool : new Pool([...pool.all(), block], true));
    if (p !== null && p !== undefined && !out.includes(p)) out.push(p);
  }
  return out;
}
function consentFold(person, sender, blocks, block) {
  const pool = poolOf(blocks);
  const has = sender !== undefined && sender !== null;
  const names = has ? namesOf(sender, block, pool) : [];
  // A recorder binds only its own side: it is named.
  const sideOf = (recorder) => has && names.includes(recorder);
  const personOf = b => b.refs.from !== undefined ? b.refs.from : b.refs.author;
  // her own word: a block about her that is backed by her (her signature, or a chain of her grants that covers it: a witness a host signs under her grant)
  const hers = b => (b.refs.from === undefined || b.refs.from === person) && isHers(b, person, pool);
  const all = pool.all().filter(b => b.type === 'observe' && b.state.kind === 'consent' && (personOf(b) === person || hers(b)) && counts(b, pool) &&
    !(b.state.word === 'yes' && asList(b.refs.subject).length === 0)); // a yes widens, so it names whom it is about; one that names no one counts for nothing
  const stops = all.filter(b => b.state.word === 'stop');
  const cons = all.filter(b => {
    if (hers(b)) return true;
    if (b.state.word === 'stop') return sideOf(b.refs.author);
    // A recorder's yes counts only for its own side, as the lift of a stop the same recorder recorded, in its causal past: her own stop
    // is lifted by her own block alone (consent.md, Only the person lifts a STOP)
    if (b.state.word === 'yes') return sideOf(b.refs.author) && !stops.some(st => hers(st) && pool.sees(b.hash, st.hash)) && stops.some(st => st.refs.author === b.refs.author && st.refs.from === person && pool.sees(b.hash, st.hash));
    return false;
  });
  const later = (a, b) => pool.sees(a.hash, b.hash) || (a.state.seq > b.state.seq && signerKeyOf(a, pool) === signerKeyOf(b, pool));
  const decide = group => {
    if (!group.length) return null;
    const maximal = group.filter(a => !group.some(b => b !== a && later(b, a)));
    const stop = maximal.filter(b => b.state.word === 'stop').sort(byHash)[0];
    if (stop) return stop;
    // A tie between other words leaves no live word; a tie that agrees stands, naming the lowest hash.
    if (maximal.some(b => b.state.word !== maximal[0].state.word)) return null;
    return maximal.sort(byHash)[0];
  };
  const aboutThem = cons.filter(b => b.refs.subject !== undefined && names.includes(b.refs.subject));
  const named = aboutThem.length ? decide(aboutThem) : undefined;
  const pick = aboutThem.length ? named : decide(cons.filter(b => b.refs.subject === undefined));
  return pick ? { word: pick.state.word, block: pick.hash } : { word: null, block: null };
}
// isStranger(receiver, sender, blocks, block): a stranger to a sender (consent.md) is someone who has dealt with none of the sender's blocks, or of those
// it is named by, and has no live yes of her own for it. Consent follows the principal: the sender is named by itself, its operators and whom its block
// speaks for (`block`, the sender's own block, lets the fold name that one).
function isStranger(receiver, sender, blocks, block) {
  const pool = poolOf(blocks);
  const names = namesOf(sender, block, pool);
  // only her accept, her counter-offer or a deal she opened with him makes a sender no stranger (decision H13): a counted block of hers that answers
  // one of his accepted, or as a counter (a promise with no status), or a promise of hers, no answer and no stop, naming him as a side. A declined or
  // stopped answer, or any other, keeps him a stranger. Only a block that counts: a forked one binds no one (core.md, invariant 3)
  const answersHis = b => asList(b.refs.answers).some(h => { const t = pool.get(h); return t && names.includes(t.refs.author); });
  const dealt = pool.all().some(b => binds(b, pool) &&
    ((answersHis(b) && (b.state.status === 'accepted' || (b.type === 'promise' && b.state.status === undefined))) ||
     (b.type === 'promise' && b.refs.answers === undefined && b.refs.updates === undefined && b.state.status === undefined && ['from', 'to'].some(k => isStr(b.refs[k]) && names.includes(b.refs[k])))) && (b.refs.author === receiver || isHers(b, receiver, pool)));
  // a recorder's yes lifts only a stop it recorded: only the receiver's own yes ends strangerhood (consent.md)
  const consent = consentFold(receiver, sender, pool, block);
  const yes = consent.word === 'yes' && Boolean(pool.get(consent.block)) && isHers(pool.get(consent.block), receiver, pool);
  return !dealt && !yes;
}
// admission_refusals(block, recipient, held, rule, arrivedToday): the message refusals of nodes.md and consent.md
function admissionRefusals(block, recipient, held, rule, today) {
  const pool = poolOf(held);
  rule = rule || {};
  const out = [];
  const author = block.refs.author;
  // an autonomous system, or a block under a grant
  const isAgent = autonomous(author, pool) || block.refs.under !== undefined;
  // consent follows the principal (consent.md): one who answered the sender, its operators, or the grantor of the live grant it acts under is no stranger
  const stranger = isStranger(recipient, author, pool, block);
  // a listed party is exempt from the count only for a block whose key still speaks for that party (nodes.md, Admission): a block of a key that does not
  // speak for her there is counted as anyone else's
  const speaksForAuthor = () => { const p = pool.get(block.hash) ? pool : new Pool([...pool.all(), block]); return identityFold(author, p).signed_by_author[block.hash] === true; };
  const listed = asList(rule.parties).includes(author) && speaksForAuthor();
  // only a rule that states an order channel refuses: with none, what the node does is its own software's choice (consent.md, decision F1)
  if (stranger && isAgent && rule.order_channel !== undefined) {
    // the order channel is a list of types; anything else names none
    const channel = Array.isArray(rule.order_channel) && rule.order_channel.some(n => typeNames(block).includes(n));
    if (!channel) out.push({ code: 'not_human', detail: 'a first block to a stranger that an autonomous system signed, outside the receiver\'s order channel' });
  }
  // per_stranger counts asks, each sender outside parties alone (nodes.md, Admission): an ask is a block that names one of the node's people in a ref; a block's pieces, and the
  // blocks its answer reads, are never counted. The block asked about is an ask when it names the receiver in a ref other than refs.author; one that is no ask is never
  // refused by the count, and `today` is the asks the node took from this sender.
  const isAsk = Object.entries(block.refs).some(([k, v]) => k !== 'author' && asList(v).includes(recipient));
  if (!listed && isAsk && Number.isInteger(rule.per_stranger) && rule.per_stranger >= 0 && today >= rule.per_stranger) out.push({ code: 'not_admitted', detail: 'the node took its per_stranger asks for the day' });
  const order = Object.keys(P.refusals.codes.message);
  return out.sort((x, y) => order.indexOf(x.code) - order.indexOf(y.code));
}
// speaksFor(block, blocks): the one party a fold counts a block for (authority.md, Who a block speaks for): the circle if it is signed `as` one by an author
// who may sign for it, else the grantor of the live grant it acts under, else its author. null when it speaks for no one: signed as a circle by an author
// without the hands the circle needs (no_role), or a block no node would take, which is no word (folds.md). It is read with the blocks as if it were held.
// No clock: the block's own date tests `until`. A genesis has no author to speak for.
function speaksFor(block, blocks) {
  if (!isObj(block)) throw argError('argument 0 is a block');
  const pool = readWith(blocks, block);
  const held = pool.get(block.hash);
  if (!held) return null;
  const who = speakerOf(held, pool);
  return who === undefined ? null : who;
}
// backed(block, person, blocks): is this block backed by the person (authority.md, Backed by a person)? { backed, why, chain }. Backed when the person signed it
// (their key speaks for them), or it is signed as a circle by one who may sign for it and the person holds `sign` in the circle's fold of the block's causal past,
// or a grantee signed it under a grant that passes the door's test (whyNotUnder: made for its signer, live at the block's own place, covering it) and whose
// chain (refs.parent, to the first grant not passed on) roots in the person's signature, or in a circle the person holds `sign` in. No clock, no arrival.
function backed(block, person, blocks) {
  if (!isObj(block)) throw argError('argument 0 is a block');
  if (!isStr(person)) throw argError('person is an id (text)');
  const pool = readWith(blocks, block), r = backedIn(block, person, pool);
  if (r.backed || block.refs.under === undefined || !pool.get(block.hash)) return r;
  // 1.9 stage 4 (A11, A fork on a tool's line): a pair on the grant's line gives { pair: true, held, at_most }; a line not read whole { not_shown, lacks }; a block or a grant in its chain that is waiting lists it
  const w = whyNotUnder(block, pool);
  if (w.length && w[0].code === 'pair') { const g = pool.get(block.refs.under); return { backed: w[0].pair, why: null, chain: [block.hash, ...(g ? grantChain(g, pool).map(x => x.hash) : [])] }; }
  if (w.length && w[0].code === 'not_shown') return { not_shown: true, lacks: w[0].lacks };
  if (w.length && w[0].code === 'waiting') return { ...r, waiting: w[0].waiting };
  return r;
}
// the same, for a whole set at once: { hash: { backed, why } }, each the verdict `backed` gives among the same blocks
function backedAll(person, blocks) {
  if (!isStr(person)) throw argError('person is an id (text)');
  const pool = poolOf(blocks), out = {};
  for (const b of asList(blocks)) if (isStr(b.hash) && !(b.hash in out)) { const r = backedIn(b, person, pool); out[b.hash] = { backed: r.backed, why: r.why }; }
  return out;
}
// whether a block is the person's own word: backed by them (authority.md, Backed by a person)
const isHers = (b, person, pool) => backedIn(b, person, pool).backed;
function backedIn(block, person, pool) {
  const b = pool.get(block.hash);
  const no = (why, chain) => ({ backed: false, why, chain });
  if (!b) return no('the block is no word: it is not valid on what it rests on, or rests on a block not held', []);
  const chain = [b.hash];
  if (!counts(b, pool)) return no('its signer\'s key does not speak for its author here (no voice of her standing list, an end it has seen, or a fork: a fork counts for nothing)', chain);
  let root, topBlock = b;
  if (b.refs.as !== undefined) {
    if (!mayActAsIn(b, b.refs.as, pool)) return no('it is signed as a circle and no row of the circle holds for it, nor did every owner sign it: it is waiting on hands and acts on nothing (no_role)', chain);
    root = b.refs.as;
  } else if (b.refs.author === person) return { backed: true, why: null, chain };
  else if (b.refs.under !== undefined) {
    const wrong = whyNotUnder(b, pool);
    if (wrong.length) return no(b.refs.author + ' signed it under a grant that does not back it: ' + wrong.map(w => w.code + ': ' + (w.code === 'pair' ? JSON.stringify(w.pair) : w.detail)).join('; '), chain);
    let g = pool.get(b.refs.under);
    for (;;) { chain.push(g.hash); const up = g.refs.parent === undefined ? null : pool.get(g.refs.parent); if (!up) break; g = up; }
    root = principalOf(g, pool); // g is grantTop(pool.get(b.refs.under), pool), walked here for the chain
    topBlock = g;
    if (root === null) return no('the grant at the top of its chain is signed as a circle by one who may not sign for it', chain);
  } else return no('it is signed by ' + b.refs.author + ', who is not ' + person + ', and names no grant', chain);
  if (root === person) return { backed: true, why: null, chain };
  const C = pool.get(root);
  // P signed a hand of the circle it is signed as: a hand of P's is among those its row counted (circles.md, authority.md Backed by a person)
  if (isFoundingCircle(C) && b.refs.as === root) { const rh = circleHolds(b, pool); if (rh && rh.holds && rh.hands.some(h => h.id === person && h.counts)) return { backed: true, why: null, chain }; }
  return no('its chain roots in ' + root + ', and ' + person + ' is neither ' + root + ' nor one of the hands that sign for it', chain);
}
// gives(block, person, blocks): what of the person's would become whose if the block stands (promises.md, What becomes whose). { gives: [line] }.
function gives(block, person, blocks) {
  if (!isObj(block)) throw argError('argument 0 is a block');
  if (!isStr(person)) throw argError('person is an id (text)');
  const pool = readWith(blocks, block), r = givesIn(block, person, pool, blocks);
  // 1.9 stage 5 (section 11, `gives`): the bench of the deal the block belongs to, the same answer `promise_stage` gives, or `none`
  const first = block.type === 'promise' && block.refs.answers === undefined ? pool.get(block.hash) : asList(block.refs.for).map(h => pool.get(h)).find(x => x && x.type === 'promise' && x.refs.answers === undefined);
  const st = first ? promiseStage(first, pool) : null;
  return { ...r, bench: st && !st.not_shown && st.bench ? st.bench : 'none' };
}
function givesIn(block, person, pool, blocks) {
  // a transfer moves the things of whoever's word it is (the top of its chain), and only if that person backs it: the reading `backed` makes
  // (a block not yet signed, the read-back shown before she signs, has no signature to judge: it is read as its signed form would be)
  if (block.type === 'transfer' && !(claimedBy(block, pool) === person && (block.signature === undefined || backedIn(block, person, pool).backed))) return { gives: [] };
  return linesIn(block, person, pool);
}
// whose word a block says it is, before anyone judges it: the circle it is signed `as`, else the top of the grant chain it names, else its author
function claimedBy(b, pool) {
  if (b.refs.as !== undefined || b.refs.under === undefined) return principalOf(b, pool);
  const g = pool.get(b.refs.under);
  return g ? principalOfChain(g, pool) : null;
}
// the lines of a block read as if the person backed it, with no judgement of who signed it (toComeBack asks them of a transfer `backed` refused)
function linesIn(block, person, pool) {
  const line = (parts, to, back) => ({ ...parts, to: to === undefined ? null : to, back: back === undefined ? null : back });
  // a thing is hers as of the block's own place in time (its causal past), never by today's owner; a thing not held is not hers, and is listed in `unplaced` (no line, but never "nothing"); a held kind is a description
  // with no owner, and promising goods of a kind is her own word
  const unplaced = [];
  const hers = w => { const t = pool.get(w); if (!t) { unplaced.push(w); return false; } if (!t.refs || t.refs.of === undefined) return true; return ownershipFold(t, pool, block.signature === undefined && !(pool._assumed && pool._assumed.has(block.hash)) ? undefined : pool.past(block.hash)).owners.some(o => o.owner === person); };
  const out = [];
  if (block.type === 'promise') {
    let deal = block, chosen;
    const st = block.state && block.state.status;
    if (st !== undefined) {
      const d = st === 'accepted' && block.refs && block.refs.answers ? pool.get(block.refs.answers) : undefined;
      if (!d || d.type !== 'promise') return { gives: [] };
      deal = d; chosen = block.state.terms && block.state.terms.quantity;
    }
    const terms = isObj(deal.state.terms) ? deal.state.terms : {}, from = deal.refs.from, to = deal.refs.to, until = isStr(terms.until) ? terms.until : undefined;
    if (from === person) {
      const things = Array.isArray(terms.lines) && terms.lines.length ? terms.lines.map(l => [isObj(l) ? l.what : undefined, isObj(l) ? l.quantity : undefined]) : asList(deal.refs.what).map(w => [w, chosen !== undefined ? chosen : terms.quantity]);
      for (const [w, q] of things) {
        if (!isStr(w) || !hers(w)) continue;
        const amount = isObj(q) && q.unit !== undefined && q.value !== undefined ? { amount: q } : {};
        // 1.9 R-H1 (3c-1): an offer that names an instance of its signer's and a receiver other than himself holds it from his own word (`held`); a yes to an order holds nothing
        const t = pool.get(w), instance = !!t && t.refs.of !== undefined;
        out.push({ ...line({ what: w, ...amount }, to, until), held: instance && st === undefined && block.refs.answers === undefined && isStr(to) && to !== from });
      }
      // a promise of an amount with no `what` and no lines (a loan of money, decided S3-20): that amount
      if (deal.refs.what === undefined && terms.lines === undefined) {
        const q = chosen !== undefined ? chosen : terms.quantity;
        if (isObj(q) && q.unit !== undefined && q.value !== undefined) out.push({ ...line({ amount: q }, to, null), held: false });
      }
    }
    if (to === person) {
      const total = termsTotal(terms, chosen);
      if (total) out.push({ ...line({ amount: total }, from, null), held: false });
    }
  } else if (block.type === 'transfer') {
    if (block.state && block.state.status !== undefined) return { gives: [] };
    const owner = block.refs.to_owner, holder = block.refs.to_holder;
    let until;
    for (const d of asList(block.refs.for)) { const x = pool.get(d); if (x && x.state && isObj(x.state.terms) && isStr(x.state.terms.until)) { until = x.state.terms.until; break; } }
    const amt = isAmount(block.state.amount) ? block.state.amount : null;
    if (amt && asList(block.refs.what).length === 0) out.push({ ...line({ amount: amt }, owner, null), held: false });
    for (const w of asList(block.refs.what)) {
      // 1.9 R-H1: a transfer that names an instance of hers and a receiver holds it from her word until it lands or is freed
      const t = pool.get(w), instance = !!t && t.refs.of !== undefined;
      if (owner !== undefined && hers(w)) out.push({ ...line({ what: w, ...(amt ? { amount: amt } : {}) }, owner, null), held: instance });
      else if (owner === undefined && holder !== undefined) out.push({ ...line({ what: w, ...(amt ? { amount: amt } : {}) }, holder, until), held: false });
    }
  }
  const unique = [...new Set(unplaced)].sort();
  return { gives: out.filter(l => l.to !== person), ...(unique.length ? { unplaced: unique } : {}) };
}
// toComeBack(person, blocks): an amount moved in the person's name that they do not back (promises.md, What is owed back). { owed: [{ block, amount, to, why }] }:
// each transfer of `blocks` whose money is the person's by `gives` and that `backed` says they do not back. A transfer no node would hold is not backed either.
function toComeBack(person, blocks) {
  if (!isStr(person)) throw argError('person is an id (text)');
  const pool = poolOf(blocks), seen = new Set(), owed = [];
  for (const b of asList(blocks)) {
    if (b.type !== 'transfer' || seen.has(b.hash)) continue;
    seen.add(b.hash);
    const read = pool.get(b.hash) ? pool : readWith(blocks, b);
    const verdict = backedIn(b, person, read);
    if (verdict.backed) continue;
    if (claimedBy(b, read) !== person) continue;
    for (const l of linesIn(b, person, read).gives) if (l.amount !== undefined && l.what === undefined) owed.push({ block: b.hash, amount: l.amount, to: l.to, why: verdict.why });
  }
  return { to_come: owed };
}

// ---- the market's shapes (promises.md: Finding, A signed check, Clearing, Rulings) ----
// an amount as an exact fraction in its kind; null for anything else
const measureOf = m => (isAmount(m) ? { kind: jcs(kindOf(m)), k: kindOf(m), v: dec(m.value) } : null);
const measureOut = (m, v) => amtOut(v, m.k);
const firstPromise = b => b.type === 'promise' && b.refs.answers === undefined && b.refs.updates === undefined;
const sortedIds = l => [...new Set(l)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
// does this person's word stand behind the block, or a block that confirms it
const signedBy = (b, p, pool) => backedIn(b, p, pool).backed || pool.all().some(c => asList(c.refs.confirms).includes(b.hash) && backedIn(c, p, pool).backed);
function lookupWrong(lk) {
  if (!isObj(lk) || lk.type !== 'observe' || lk.state.kind !== 'lookup') return 'the first block is no lookup (an observe of kind lookup)';
  if (lk.state.side !== 'offer' && lk.state.side !== 'want') return 'a lookup says which side it looks for: `side` is offer or want';
  if (lk.state.terms !== undefined && !isObj(lk.state.terms)) return 'a lookup\'s `terms` is an object of the terms an item must carry';
  return null;
}
function itemWrong(lk, h, pool) {
  const b = pool.get(h);
  if (!b) return 'it is not a block the reader holds';
  if (!firstPromise(b)) return 'it is not a first promise';
  if (!counts(b, pool)) return 'its signer\'s key does not speak for its author here';
  const offer = lk.state.side === 'offer', signs = offer ? b.refs.from : b.refs.to, other = offer ? b.refs.to : b.refs.from;
  if (signs === undefined || other !== undefined || !backedIn(b, signs, pool).backed) return 'it is not the signed ' + lk.state.side + ' of one side with the other open';
  const st = promiseStage(b, pool);
  if (!st || (st.stage !== 'offered' && st.stage !== 'asked')) return 'it is no longer open';
  const wanted = asList(lk.refs.what);
  if (wanted.length && !asList(b.refs.what).some(w => wanted.includes(w))) return 'it names none of the things the lookup asks for';
  const tm = isObj(b.state.terms) ? b.state.terms : {};
  for (const [k, v] of Object.entries(lk.state.terms || {})) if (JSON.stringify(canonicalSort(tm[k])) !== JSON.stringify(canonicalSort(v))) return 'its term `' + k + '` is not the one the lookup asks for';
  return null;
}
const canonicalSort = v => Array.isArray(v) ? v.map(canonicalSort) : isObj(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonicalSort(v[k])])) : v;
function listingCheck(lookup, listing, blocks) {
  if (!isObj(lookup) || !isObj(listing)) throw argError('arguments 0 and 1 are blocks');
  const pool = poolOf(blocks), none = why => ({ ok: false, why, bad: [], left_out: [] });
  const w = lookupWrong(lookup);
  if (w) return none(w);
  if (listing.type !== 'observe' || listing.state.kind !== 'listing') return none('the second block is no listing (an observe of kind listing)');
  if (listing.refs.answers !== lookup.hash) return none('the listing does not answer this lookup');
  const named = sortedIds(asList(listing.refs.derives_from));
  const bad = [];
  for (const h of named) { const why = itemWrong(lookup, h, pool); if (why) bad.push({ hash: h, why }); }
  const left = sortedIds(pool.all().map(b => b.hash).filter(h => !named.includes(h) && itemWrong(lookup, h, pool) === null));
  return { ok: bad.length === 0, why: bad.length ? bad[0].hash + ': ' + bad[0].why : null, bad, left_out: left };
}
function checkReads(check, blocks) {
  if (!isObj(check)) throw argError('argument 0 is a block');
  const pool = poolOf(blocks), no = (why, read) => ({ ok: false, why, read: read || [] });
  if (check.type !== 'observe' || check.state.kind !== 'check') return no('the block is no check');
  const subject = check.refs.subject;
  if (!isStr(subject)) return no('a check names the one whose record it read');
  const named = sortedIds(asList(check.refs.derives_from));
  if (!named.length) return no('a check names what it read');
  let wrong = null;
  const read = named.map(h => {
    const b = pool.get(h), held = !!b;
    const concerns = held && (backedIn(b, subject, pool).backed || [b.refs.from, b.refs.to].includes(subject));
    const st = held && firstPromise(b) ? promiseStage(b, pool) : null;
    const stage = st ? st.stage : null;
    if (wrong === null) {
      if (!held) wrong = h + ' is not held';
      else if (!concerns) wrong = h + ' is not the subject\'s';
      else if (check.state.of !== undefined && b.type !== check.state.of) wrong = h + ' is not of the type the check says';
      else if (check.state.stage !== undefined && stage !== check.state.stage) wrong = h + ' is not at the stage the check says';
    }
    return { hash: h, held, concerns, stage };
  });
  if (wrong === null && check.state.count !== undefined && check.state.count !== named.length) wrong = 'the check says it read ' + check.state.count + ', and names ' + named.length;
  return { ok: wrong === null, why: wrong, read };
}
// who owes the price of a deal and who is owed it
function dealSides(st) {
  const debtor = st.sides && isStr(st.sides.to) ? st.sides.to : null;
  const owners = st.to_come && Array.isArray(st.to_come.from) ? st.to_come.from.map(l => l.owner).filter(isStr) : [];
  const creditors = owners.length ? sortedIds(owners) : (st.sides && isStr(st.sides.from) ? [st.sides.from] : []);
  return { debtor, creditors };
}
function clearingApplied(clearing, blocks) {
  if (!isObj(clearing)) throw argError('argument 0 is a block');
  const pool = readWith(blocks, clearing), stop = why => ({ binds: false, why, who: [], missing: [], lines: [] });
  if (clearing.type !== 'observe' || clearing.state.kind !== 'clearing') return stop('the block is no clearing');
  const lines = clearing.state.lines;
  if (!Array.isArray(lines) || !lines.length) return stop('a clearing lists the promises it reduces');
  const who = [], out = [];
  for (const line of lines) {
    const deal = isObj(line) && isStr(line.deal) ? line.deal : '';
    const shown = { deal, ok: false, why: null, to_come: null, reduce: null, left: null };
    const no = why => { shown.why = why; out.push(shown); };
    const first = pool.get(deal);
    if (!first || !firstPromise(first)) { no('the deal is not a first promise the reader holds'); continue; }
    const st = promiseStage(first, pool);
    if (!st) { no('the deal rests on blocks the reader does not hold'); continue; }
    const sides = dealSides(st);
    for (const p of [sides.debtor, ...sides.creditors]) if (p !== null && !who.includes(p)) who.push(p);
    if (!stageBinds(st)) { no('the deal does not bind'); continue; }
    const total = st.total ? measureOf(st.total) : null;
    if (!total) { no('the deal states no price'); continue; }
    const paidM = st.paid ? measureOf(st.paid) : null;
    const paid = paidM && paidM.kind === total.kind ? paidM.v : { n: 0n, d: 1n };
    const owed = { n: total.v.n * paid.d - paid.n * total.v.d, d: total.v.d * paid.d };
    shown.to_come = measureOut(total, owed);
    const red = measureOf(line.reduce);
    if (!red || fcmp(red.v, { n: 0n, d: 1n }) <= 0) { no('`reduce` is an amount above nothing'); continue; }
    shown.reduce = measureOut(red, red.v);
    let applied = red.v;
    if (red.kind !== total.kind) {
      const rate = isStr(line.rate) ? pool.get(line.rate) : undefined;
      if (!rate || rate.type !== 'observe' || rate.state.kind !== 'rate') { no('it clears one kind against another and names no rate both sides signed'); continue; }
      const parties = [sides.debtor, ...sides.creditors].filter(p => p !== null);
      if (!parties.every(p => signedBy(rate, p, pool))) { no('the rate is not signed by both sides'); continue; }
      const give = measureOf(rate.state.give), get = measureOf(rate.state.get), app = measureOf(line.applies);
      if (!give || !get || !app) { no('a rate says what is given for what is got, and the line says what it applies'); continue; }
      const prod = (a, b) => ({ n: a.n * b.n, d: a.d * b.d });
      if (give.kind !== red.kind || get.kind !== total.kind || app.kind !== total.kind || fcmp(prod(red.v, get.v), prod(app.v, give.v)) !== 0) { no('the amount applied is not the rate\'s worth of the amount reduced'); continue; }
      applied = app.v;
    }
    if (fcmp(applied, owed) > 0) { no('it reduces the deal by more than is still to come'); continue; }
    shown.left = measureOut(total, { n: owed.n * applied.d - applied.n * owed.d, d: owed.d * applied.d });
    shown.ok = true;
    out.push(shown);
  }
  const people = sortedIds(who), signed = people.filter(p => signedBy(clearing, p, pool)), missing = people.filter(p => !signed.includes(p));
  const first = out.find(l => !l.ok);
  const why = first ? first.deal + ': ' + first.why : missing.length ? missing.length + ' of those in it have not signed' : null;
  return { binds: why === null, why, who: people, missing, lines: out };
}
// ruledFor(c, pool, now): the judge's head ruling on the deal, and its award line to the person (promises.md, Rulings); { ruling, award } or { why }; null for another shape
function ruledFor(c, pool) {
  if (!isObj(c) || !('ruled' in c)) return null;
  if (![c.ruled, c.by, c.awards].every(x => isStr(x) && RX.id.test(x))) return { why: 'a condition `ruled` names the deal, the judge and the person it awards to' };
  const mine = pool.all().filter(o => o.type === 'observe' && o.state.kind === 'ruling' && o.refs.subject === c.ruled && counts(o, pool) && backedIn(o, c.by, pool).backed); // R-H9: no reader's clock (3c-6); the head is read in the relying block's past
  if (!mine.length) return { why: 'the judge has made no ruling on the deal' };
  const heads = mine.filter(w => !mine.some(o => o !== w && pool.sees(o.hash, w.hash)));
  if (heads.length !== 1) return { why: 'two rulings that do not see each other' };
  const award = asList(heads[0].state.awards).find(l => isObj(l) && l.to === c.awards);
  return award ? { ruling: heads[0].hash, award } : { why: 'the ruling awards nothing to that person' };
}
function rulingReleases(stake, blocks) {
  if (!isObj(stake)) throw argError('argument 0 is a block');
  const pool = readWith(blocks, stake), no = why => ({ releases: false, to: null, amount: null, ruling: null, why });
  // a stake releases only if it binds. A promise binds once its stage says so (the accept consents to the terms that name the judge: both sides chose her);
  // a transfer is its giver's own signed move, so it counts if its key speaks for her and every deal it is `for` binds
  const stageBinds = h => { const f = pool.get(h), st = f ? promiseStage(f, pool) : null; return !!st && (['accepted', 'underway', 'done', 'reversed'].includes(st.stage) || (st.stage === 'stopped' && st.stop === 'onward')); };
  const cond = stake.type === 'promise' ? (isObj(stake.state.terms) ? stake.state.terms.condition : undefined) : stake.type === 'transfer' ? stake.state.condition : undefined;
  // a transfer rests on every deal it is `for`, and on the deal its condition `ruled` names when that is a first promise held (a ruling may be about a claim or a thing)
  const ruledDeal = isObj(cond) && isStr(cond.ruled) && pool.get(cond.ruled) && pool.get(cond.ruled).type === 'promise' && pool.get(cond.ruled).refs.answers === undefined ? [cond.ruled] : [];
  const binding = stake.type === 'promise' ? stageBinds(stake.hash) : counts(stake, pool) && [...asList(stake.refs.for), ...ruledDeal].every(h => !!pool.get(h) && stageBinds(h));
  const r = ruledFor(cond, pool);
  if (r === null) return no('the stake\'s condition names no ruling');
  if (r.why) return no(r.why);
  if (!binding) return { releases: false, to: r.award.to, amount: null, ruling: r.ruling, why: 'the stake does not bind: it is not signed by both sides who name this judge, or the deal it serves is not accepted' };
  let staked = null;
  if (stake.type === 'promise') { const t = isObj(stake.state.terms) ? termsTotal(stake.state.terms) : null; staked = t ? measureOf(t) : null; } else staked = measureOf(stake.state.amount);
  const awarded = measureOf(r.award.amount);
  let money = null;
  if (staked) {
    if (awarded && awarded.kind !== staked.kind) return no('the award is in another kind than the stake');
    money = measureOut(staked, awarded && fcmp(awarded.v, staked.v) < 0 ? awarded.v : staked.v);
  }
  return { releases: true, to: r.award.to, amount: money, ruling: r.ruling, why: null };
}
// rulingAudience(ruling, blocks, now): whether a judge's ruling is public (promises.md, Rulings). { audience: 'public' | 'private', why }.
// The judge's offer is a first promise of hers under the base schema `judging`, `refs.to` open; its head (no other offer of hers has it in its causal past)
// is the one she stands on. Its `terms.rulings` is "public", or absent (private). Whatever it says, a ruling is public when an award line of it has a `due`
// at or before the reader's clock and no counted transfers `for` the ruling to the one it awards adding up to its sum (no sum: only her release honours it): unhonoured, a fact and never a verdict.
function rulingAudience(ruling, blocks, now) {
  if (!isObj(ruling)) throw argError('argument 0 is a block');
  const pool = readWith(blocks, ruling), out = (audience, why) => ({ audience, why });
  if (ruling.type !== 'observe' || ruling.state.kind !== 'ruling') return out('private', 'the block is no ruling (an observe of kind ruling)');
  const judge = counts(ruling, pool) ? speakerOf(ruling, pool) : null;
  if (!judge || !backedIn(ruling, judge, pool).backed) return out('private', 'no judge\'s key speaks for this ruling');
  const clock = isStr(now) ? now : null;
  // an award with a sum is paid by counted transfers `for` the ruling to the awardee that add up to it in its kind, whoever paid; one with no sum, only a release honours
  const paidIn = l => {
    const want = measureOf(l.amount);
    if (want === null) return false;
    let tot = { n: 0n, d: 1n };
    for (const t of pool.all()) {
      if (t.type !== 'transfer' || t.state.status !== undefined || !asList(t.refs.for).includes(ruling.hash) || t.refs.to !== l.to || !counts(t, pool)) continue;
      const m = measureOf(t.state.amount);
      if (m && m.kind === want.kind) tot = { n: tot.n * m.v.d + m.v.n * tot.d, d: tot.d * m.v.d };
    }
    return fcmp(tot, want.v) >= 0;
  };
  const unhonoured = clock !== null && asList(ruling.state.awards).some(l => isObj(l) && isStr(l.due) && l.due <= clock
    && !paidIn(l)
    && !pool.all().some(r => r.type === 'observe' && r.state.kind === 'release' && r.state.status === undefined && r.refs.subject === ruling.hash && isStr(l.to) && counts(r, pool) && speakerOf(r, pool) === l.to));
  if (unhonoured) return out('public', 'an award of the ruling is unpaid past its due date');
  const offers = pool.all().filter(o => o.type === 'promise' && !o.refs.answers && !o.refs.updates && o.refs.to === undefined && backedIn(o, judge, pool).backed
    && (s => isObj(s) && s.state.kind === 'schema' && s.state.name === 'judging')(pool.get(o.refs.schema)));
  const heads = offers.filter(w => !offers.some(o => o !== w && pool.sees(o.hash, w.hash)));
  if (heads.length === 1 && isObj(heads[0].state.terms) && heads[0].state.terms.rulings === 'public') return out('public', 'the judge\'s offer says her rulings are public');
  return out('private', 'the judge\'s offer does not say her rulings are public');
}
// feeBack(offer, deal, blocks): what a judge's fee back comes to when the sides settle (promises.md, Rulings). { settled, releases, owed, why }.
// The offer is hers: a first promise under the base schema `judging`, refs.from the judge and backed by her, refs.to open, with terms.conciliation true and
// terms.fee_back a decimal 0 to 1. The sides settle when each of the deal's two sides has signed a release (an observe of kind release, no status, refs.subject
// the deal) and neither release has a ruling of hers on the deal (an observe of kind ruling, refs.subject the deal, backed by her) in its causal past.
// owed lists, per payer and kind, the fee paid (amounts of counted transfers from the payer to her, for the offer, refs.subject the deal) times fee_back, exact (nothing is
// rounded); returned is what she has since sent that payer the same way; left the rest, never below zero.
function feeBack(offer, deal, blocks) {
  if (!isObj(offer) || !isObj(deal)) throw argError('arguments 0 and 1 are blocks');
  const pool = new Pool([...poolOf(blocks).all().filter(x => x.hash !== offer.hash && x.hash !== deal.hash), offer, deal]);
  const out = (settled, releases, to_come, why) => ({ settled, releases, to_come, why });
  const judge = offer.refs.from;
  if (!(offer.type === 'promise' && !offer.refs.answers && !offer.refs.updates && isStr(judge) && offer.refs.to === undefined && backedIn(offer, judge, pool).backed)) return out(false, [], [], 'the offer is no judge\'s offer: a first promise of hers, backed by her, with the other side open');
  const sch = pool.get(offer.refs.schema);
  if (!(isObj(sch) && sch.state.kind === 'schema' && sch.state.name === 'judging')) return out(false, [], [], 'the offer is not under the base schema judging');
  const t0 = termsOf(offer);
  if (!(t0.conciliation === true && isStr(t0.fee_back) && RX.decimal.test(t0.fee_back))) return out(false, [], [], 'the offer states no conciliation with a fee back');
  const fb = dec(t0.fee_back);
  if (!isStr(deal.refs.from) || !isStr(deal.refs.to)) return out(false, [], [], 'the deal names no two sides');
  const rulings = pool.all().filter(o => o.type === 'observe' && o.state.kind === 'ruling' && o.refs.subject === deal.hash && backedIn(o, judge, pool).backed);
  const releaseOf = side => {
    const rs = pool.all().filter(r => r.type === 'observe' && r.state.kind === 'release' && r.state.status === undefined && r.refs.subject === deal.hash && counts(r, pool) && speakerOf(r, pool) === side
      && !rulings.some(g => pool.sees(r.hash, g.hash))).map(r => r.hash).sort();
    return rs.length ? rs[0] : null;
  };
  const a = releaseOf(deal.refs.from), b = releaseOf(deal.refs.to);
  if (a === null || b === null) return out(false, [], [], 'the sides have not both released the deal before a ruling of hers');
  const sums = new Map(); // payer + kind -> { payer, kind, paid, back }
  for (const t of pool.all()) {
    if (t.type !== 'transfer' || t.state.status !== undefined || !asList(t.refs.for).includes(offer.hash) || t.refs.subject !== deal.hash || !counts(t, pool)) continue;
    const m = t.state.amount;
    if (!isAmount(m)) continue;
    const sp = speakerOf(t, pool);
    let payer, side;
    if (sp === judge && isStr(t.refs.to) && backedIn(t, judge, pool).backed) { payer = t.refs.to; side = 'back'; } else if (t.refs.to === judge && isStr(sp)) { payer = sp; side = 'paid'; } else continue;
    const key = payer + '\0' + jcs(kindOf(m));
    if (!sums.has(key)) sums.set(key, { payer, kind: kindOf(m), paid: F0, back: F0, paying: false });
    const e = sums.get(key);
    e[side] = fadd(e[side], dec(m.value));
    if (side === 'paid') e.paying = true;
  }
  const lines = [...sums.values()].filter(x => x.paying).sort((x, y) => cmp(x.payer, y.payer) || cmp(jcs(x.kind), jcs(y.kind)));
  // the fee back is the fee paid times fee_back, exact: nothing is rounded
  const owed = lines.map(x => {
    const fee = fmul(x.paid, fb);
    const left = fcmp(fee, x.back) > 0 ? fsub(fee, x.back) : F0;
    return { to: x.payer, amount: amtOut(fee, x.kind), returned: amtOut(x.back, x.kind), left: amtOut(left, x.kind) };
  });
  return out(true, [a, b].sort(), owed, null);
}
// accountOf(who, blocks): where a person says money to them goes (promises.md, Where to pay me). The words counted are the `observe` blocks of kind `account` that `who`
// signed, that speak for no one else and that a node would take; the head is the one no other of those has in its causal past. null for none, for two heads that
// do not see each other, and for a head with no destination (it ends the account).
// 1.9 3e-8 (promises.md, Where to pay me): an account word states `destinations: [{ destination, by }]`. Of one signer's account words the head is the one no other of hers has in its causal past. A new word replaces the old, and two heads that do not see
// each other name none. The answer is { who, destinations, hash, at } or null.
function accountHeads(who, pool, past) {
  const words = pool.all().filter(b => b.type === 'observe' && b.state.kind === 'account' && b.state.status === undefined && (b.refs.author === who || b.refs.as === who) && (!past || past.has(b.hash)) && counts(b, pool) && speakerOf(b, pool) === who); // 1.9 stage 6 (C9a): a word `as` a circle counts for it where a row holds for it
  return words.filter(w => !words.some(o => o !== w && pool.sees(o.hash, w.hash)));
}
const destinationsOk = d => Array.isArray(d) && d.length > 0 && d.every(x => isObj(x) && isStr(x.destination) && x.destination.trim() !== '' && isStr(x.by));
function accountOf(who, blocks) {
  if (!isStr(who)) throw argError('who is an id (text)');
  const pool = poolOf(blocks);
  const heads = accountHeads(who, pool, null);
  if (heads.length !== 1) return null;
  const d = heads[0].state.destinations;
  return destinationsOk(d) ? { who, destinations: d.map(x => ({ destination: x.destination, by: x.by })), hash: heads[0].hash, at: isStr(heads[0].state.at) ? heads[0].state.at : null } : null;
}
// ---- the door's stage 4 operations
// keeps_to(C, A, held): { keeps, why }
function keepsToOp(C, A, held) {
  if (!isObj(C) || !isObj(A)) throw argError('arguments 0 and 1 are blocks');
  const pool = readWith(readWith(held, A).all(), C);
  return keepsTo(pool.get(C.hash) || C, pool.get(A.hash) || A, pool, {});
}
const s4Pub = r => ({ block: r.block, by: r.by, amount: r.amount, takes: r.takes, why: r.why, state: r.state, ...(r.once ? { once: true } : {}) });
// meter(grant, held, block?): { grant, fits, why, line, start, period, draws, left, waiting, ended, comes_back } or { not_shown, lacks }
function meterOp(gb, held, at) {
  if (!isObj(gb)) throw argError('argument 0 is a grant');
  const pool = readWith(isObj(at) ? readWith(asList(held).filter(x => !isObj(x) || x.hash !== at.hash), at).all() : held, gb), g = pool.get(gb.hash);
  if (!g || g.type !== 'grant') return { not_shown: true, lacks: [gb.hash] };
  return s4MeterRead(g, pool, isObj(at) ? pool.get(at.hash) || null : null);
}
function lowestOp(gb, held) {
  if (!isObj(gb)) throw argError('argument 0 is a grant');
  const pool = readWith(held, gb), g = pool.get(gb.hash);
  if (!g || g.type !== 'grant') return { not_shown: true, lacks: [gb.hash] };
  return s4Lowest(g, pool);
}
// ---- G18: the worst case, from her grant and the promises it names alone. Per kind; never added across kinds.
const s4Ends = v => (isRangeV(v) ? { lo: 'min' in v ? v.min : null, hi: 'max' in v ? v.max : null } : isListV(v) ? { lo: v.one_of[0], hi: v.one_of[v.one_of.length - 1] } : { lo: v, hi: v });
const s4KindKey = k => [k.unit, k.of === null || k.of === undefined ? null : k.of];
const s4KindCmp = (a, b) => { const x = s4KindKey(a), y = s4KindKey(b); return x[0] !== y[0] ? cmp(x[0], y[0]) : x[1] === y[1] ? 0 : x[1] === null ? -1 : y[1] === null ? 1 : cmp(x[1], y[1]); };
function worstOp(gb, held) {
  if (!isObj(gb)) throw argError('argument 0 is a grant');
  const pool = readWith(held, gb), g = pool.get(gb.hash);
  if (!g || g.type !== 'grant') return { not_shown: true, lacks: [gb.hash] };
  const sc = scopeOf(g), principal = g.refs.author, limit = limitOf(g);
  // per kind: a fraction, or null for a kind with no top
  const add = (m, a, kind) => { if (a) { const k = jcs(a.kind); const e = m.get(k); if (!e) m.set(k, { kind: a.kind, f: a.f }); else if (e.f !== null) e.f = fadd(e.f, a.f); } else if (kind) m.set(jcs(kind), { kind, f: null }); };
  const hand = new Map(), toCome = new Map(), lose = new Map(), on = [], part = [];
  const totalAt = (p, q) => { if (p === null || p === undefined) return null; return termsTotalF({ price: p }, q === null ? undefined : q); };
  const ons = asList(sc.on).map(h => pool.get(h)).filter(A => A && A.type === 'promise');
  // 1.9 stage 7 (compare): a sell from an instance the grant names counts once with that instance's part, at the largest of them (G18)
  const whats = asList(g.refs.what), fromWhat = new Map();
  for (const A of ons) {
    const t = isObj(A.state.terms) ? A.state.terms : {}, sells = A.refs.from === principal, price = t.price, qty = t.quantity;
    const pe = price === undefined ? { lo: null, hi: null } : s4Ends(price), qe = qty === undefined ? { lo: null, hi: null } : s4Ends(qty);
    const end = pe.hi !== null ? pe.hi : pe.lo;
    const moneyKind = end === null || end === undefined ? null : isAmount(end) ? kindOf(end) : isObj(end) && isAmount(end.amount) ? kindOf(end.amount) : null;
    const inst = sells ? whats.find(w => asList(A.refs.what).includes(w)) : undefined;
    if (sells && inst !== undefined && isAmount(qe.hi)) { if (!fromWhat.has(inst)) fromWhat.set(inst, []); fromWhat.get(inst).push({ f: dec(qe.hi.value), kind: kindOf(qe.hi) }); add(toCome, totalAt(pe.hi, qe.hi), moneyKind); }
    else if (sells) { add(hand, isAmount(qe.hi) ? { f: dec(qe.hi.value), kind: kindOf(qe.hi) } : null, null); add(toCome, totalAt(pe.hi, qe.hi), moneyKind); }
    else add(hand, totalAt(pe.hi, qe.hi), moneyKind || (limit ? kindOf(limit) : null));
    on.push({ promise: A.hash, side: sells ? 'from' : 'to', price: price === undefined ? null : price, quantity: qty === undefined ? null : qty });
  }
  for (const m of s4Measures(g, pool).filter(m => asList(g.refs.what).includes(m.of))) {
    if (m.amount) part.push(m.amount);
    const a = m.amount ? { f: dec(m.amount.value), kind: kindOf(m.amount) } : null;
    add(lose, a, null);
    const once = new Map();
    for (const x of [...(a ? [a] : []), ...(fromWhat.get(m.of) || [])]) { const k = jcs(x.kind), e = once.get(k); if (!e || fcmp(x.f, e.f) > 0) once.set(k, x); }
    fromWhat.delete(m.of);
    for (const x of once.values()) add(hand, x, null);
  }
  const types = asList(sc.types);
  if (types.includes('observe.paid') || types.includes('observe.received')) for (const [k, v] of toCome) { const e = lose.get(k); if (!e) lose.set(k, { ...v }); else if (e.f !== null) e.f = v.f === null ? null : fadd(e.f, v.f); }
  if (limit) { const k = jcs(kindOf(limit)), e = hand.get(k); hand.set(k, { kind: kindOf(limit), f: e && e.f !== null && fcmp(e.f, dec(limit.value)) < 0 ? e.f : dec(limit.value) }); }
  else if (sc.each === undefined) for (const [k, v] of hand) if (!lose.has(k)) v.f = F0;
  const perKind = m => [...m.values()].filter(v => v.f !== null && fpos(v.f)).sort((x, y) => s4KindCmp(x.kind, y.kind)).map(v => amtOut(v.f, v.kind));
  const L = s4Line(g, pool), ks = clocksOf(sc.clocks);
  const sides = [...new Set([...asList(sc.parties), ...ons.flatMap(A => ['from', 'to'].flatMap(k => asList(A.refs[k]))).filter(x => x !== principal)])].sort();
  return {
    holder: isStr(g.refs.to) ? g.refs.to : null, types: sc.types === undefined ? [] : sc.types, on, what: g.refs.what === undefined ? null : g.refs.what, part, sides,
    each: sc.each === undefined ? null : sc.each, limit: sc.limit === undefined ? null : sc.limit, every: sc.every === undefined ? null : sc.every, until: sc.until === undefined ? null : sc.until,
    periods: sc.every === undefined ? null : sc.every, at_most: perKind(hand), can_lose: perKind(lose), clocks: sc.clocks === undefined ? null : sc.clocks,
    deadline: sc.deadline === undefined ? null : sc.deadline, fallback: sc.fallback === undefined ? null : sc.fallback, stop: ks ? { names: ks.names, lines: ks.names.length + 1 - ks.needed } : null,
    meter: L === null || L.missing ? null : L.own ? 'own' : L.name, pays: types.includes('transfer'),
  };
}
// scope_reading(scope): the one reading of a grant's state.scope, every default the spec states and nothing else filled in; junk reads as absent
function scopeReading(scope) {
  const none = { types: [], parties: [], on: [], limit: null, each: null, every: null, until: null, clocks: null, deadline: null, fallback: null, junk: [] };
  if (scope === undefined || scope === null) return none;
  if (!isObj(scope)) return { ...none, junk: ['scope'] };
  const idList = v => !(Array.isArray(v) && v.every(x => isStr(x) && RX.id.test(x))) || v.some(x => idProblem(x) === 'unknown_suite');
  const unreadable = {
    types: v => !(Array.isArray(v) && v.every(isStr)), parties: idList, on: idList,
    limit: v => amountProblem(v) !== null || decCmp(v.value, '0') < 0, each: v => amountProblem(v) !== null || decCmp(v.value, '0') < 0,
    every: v => durationProblem(v) !== null || scope.limit === undefined || scope.until === undefined, until: v => timeProblem(v) !== null,
    clocks: v => clocksOf(v) === null, deadline: v => timeProblem(v) !== null, fallback: v => !P.fallbacks.includes(v) || scope.deadline === undefined,
    ends_on: v => endsOnProblem(v) !== null,
  };
  const junk = Object.keys(scope).filter(k => !Object.prototype.hasOwnProperty.call(unreadable, k) || unreadable[k](scope[k])).sort();
  const read = k => (k in scope && !junk.includes(k) ? scope[k] : null);
  return { types: read('types') || [], parties: read('parties') || [], on: read('on') || [], limit: read('limit'), each: read('each'), every: read('every'), until: read('until'), clocks: read('clocks'), deadline: read('deadline'), fallback: read('fallback'), junk };
}
// residency (profiles/residency.md): a receiver that states a non-empty holds_in refuses a block whose stays_in does not list every entry of it;
// one that states none refuses nothing, and a block with no stays_in asks nothing. Labels are compared exactly; none is expanded.
const residencyRefusals = (block, holdsIn) => {
  const labels = v => (Array.isArray(v) ? v : isStr(v) && v !== '' ? [v] : []).filter(isStr);
  const holds = Array.isArray(holdsIn) ? holdsIn.filter(isStr) : [], stays = labels(block.state.stays_in);
  if (!holds.length || !stays.length) return [];
  return holds.every(r => stays.includes(r)) ? [] : [{ code: 'residency', detail: 'the node holds outside stays_in' }];
};
// A model's reading is the autonomous system's claim; it becomes the person's only when she puts that fact to someone else in her own step (things.md, Truth)
const readingIsPersonsClaim = (reading, person, blocks) => reading.state.kind === 'reading' && poolOf(blocks).all().some(b => b.refs.author === person && asList(b.refs.derives_from).includes(reading.hash) && [...asList(b.refs.to), ...asList(b.refs.to_owner)].some(x => x !== person));

// ================================================================ messages (privacy.md, nodes.md)
const withoutSignature = m => { const o = { ...m }; delete o.signature; return o; };
const signMessage = (m, privHex, suite) => ({ ...withoutSignature(m), signature: signBytes(Buffer.from(jcs(withoutSignature(m)), 'utf8'), privHex, suite) });
// A key signs four shapes, told apart by their top-level keys (core.md, section 2): a request has `signer` and `node`, an answer has `node` and neither `signer` nor `hash`; a header (`hash`)
// or a genesis (`type`) is no message. A verifier checks the key set before the signature.
const messageShape = m => (!isObj(m) ? null : 'signer' in m && 'node' in m ? 'request' : 'node' in m && !('signer' in m) && !('hash' in m) && !('type' in m) ? 'answer' : null);
// 1.9 3a-10: `verify_message` checks the key before the signature: a key spelled no suite's way opens nothing, and a header or a genesis is no message
const verifyMessage = (m, pubHex) => messageShape(m) !== null && suiteOfKey(pubHex) !== null && verifyBytes(Buffer.from(jcs(withoutSignature(m)), 'utf8'), m.signature, pubHex);
// A signed request carries the signer, the node it is for, exactly one of counter or challenge (no time), and a signature.
function requestRefusals(m, o, fields) {
  const out = [];
  const keys = asList(o.keys);
  // a signed request is exactly the keys protocol.json gives it: any other key is not a signed request of this signer
  if (!isObj(m) || Object.keys(m).some(k => !fields.includes(k))) out.push({ code: 'bad_signature', detail: 'a signed request carries only the keys of messages.signed_pull or signed_push' });
  if (!isStr(m.signature) || !keys.some(k => verifyMessage(m, k))) out.push({ code: 'bad_signature', detail: 'not signed by the signer it names' });
  if (m.node !== o.node) out.push({ code: 'wrong_node', detail: 'it names another node' });
  const hasC = m.counter !== undefined, hasCh = m.challenge !== undefined;
  const replay = (hasC === hasCh) || (hasC && !(Number.isSafeInteger(m.counter) && m.counter >= 0 && m.counter > (o.highest === undefined ? -1 : o.highest))) || (hasCh && !asList(o.issued).includes(m.challenge));
  if (replay) out.push({ code: 'replay', detail: 'its counter is not above the highest seen, or its challenge was not issued or was used' });
  return out;
}
const pullRefusals = (m, o) => requestRefusals(m, o, C.messages.signed_pull), pushRefusals = (m, o) => requestRefusals(m, o, C.messages.signed_push);
const answerSignedBy = (a, pubHex) => verifyMessage(a, pubHex);
const pushAnswer = (fields, o) => signMessage({ ...withoutSignature(fields), node: o.node }, o.privateKey, o.suite || 'std');
const pushRequest = (messages, forWhom) => ({ messages, for: forWhom });
// the discovery document's shape (nodes.md, Discovery), one problem per line (stage 7 compare: the core's checks and words): the fields of messages.discovery and no other; `node` an id;
// `reads` the ids of the rule sets it runs; `log` (where it keeps one) an id; `admission` the hash of its admission block or null; `endpoints` exactly pull, push and challenge, each a URL or null.
// Its signature is checked as any signed message's (answer_signed_by), not here.
function wellKnownErrors(d) {
  if (!isObj(d) || d.protocol !== 'foodblock') return ['protocol is "foodblock"'];
  const disc = C.messages.discovery, eps = C.messages.endpoints, isId = v => isStr(v) && RX.id.test(v);
  const out = Object.keys(d).filter(k => !disc.includes(k)).map(k => `${k} is not part of discovery (${disc.join(', ')})`);
  if (!isId(d.node)) out.push('node is the id of the node (an actor)');
  if (!(Array.isArray(d.reads) && d.reads.every(isId))) out.push('reads lists the ids of the rule sets the node runs');
  if (d.log !== undefined && !isId(d.log)) out.push('log is the id of the block that brought the log\'s key in');
  if (!(d.admission === null || isId(d.admission))) out.push('admission is the hash of the admission block');
  const e = d.endpoints;
  if (!(isObj(e) && Object.keys(e).every(k => eps.includes(k)) && eps.every(k => e[k] === null || (isStr(e[k]) && (e[k].startsWith('http://') || e[k].startsWith('https://')))))) out.push(`endpoints: { ${eps.join(', ')} } are URLs`);
  return out;
}
// the discovery document a node states (nodes.md, Discovery), unsigned: its signature is the node's, over these fields
function wellKnown(node, reads, admission, endpoints, log) {
  const doc = { protocol: 'foodblock', reads: [...new Set(asList(reads))].sort(), node, admission: admission === undefined ? null : admission, endpoints: Object.fromEntries(C.messages.endpoints.map(k => [k, isObj(endpoints) && isStr(endpoints[k]) && endpoints[k] !== '' ? endpoints[k] : null])) };
  if (isStr(log)) doc.log = log;
  return doc;
}
// a local announcement (mDNS / DNS-SD or a short-range link): the fields of messages.announcement the document carries (1.9 stage 7, B2: `reads` where `version` was)
const announcement = d => Object.fromEntries(C.messages.announcement.filter(k => isObj(d) && d[k] !== undefined && d[k] !== null).map(k => [k, d[k]]));
// A sealed copy: open it, check the block inside (size limit), return what the recipient learns.
function openCopy(msg, privHex) {
  if (msg.version !== undefined) throw cryptoError('a sealed copy carries no version', 'shape');
  const plain = open(msg.envelope, privHex);
  if (plain.version !== undefined) throw cryptoError('a plaintext carries no version', 'shape');
  // 1.9 3a-11: the plaintext is { block, reveals } and may carry `pad`, a string of spaces, which a reader ignores
  if ('pad' in plain && !(isStr(plain.pad) && /^ *$/.test(plain.pad))) throw cryptoError('pad is a string of spaces', 'shape');
  const b = blockOnly(plain.block);
  if (Buffer.byteLength(canonical(b.type, b.state, b.refs), 'utf8') > P.limits.block_bytes) { const e = new Error('size_limit'); e.code = 'size_limit'; e.kind = 'refusal'; throw e; }
  const hash = hashOfBlock(b, suiteFromBlock(b));
  // the public header describes the body exactly (privacy.md): its hash, author, key, seq, prev and flags
  const h = msg.header;
  if (isObj(h) && (h.hash !== hash || h.author !== b.refs.author || h.seq !== b.state.seq || h.prev !== b.refs.prev || h.key !== b.refs.key || ['skip'].some(f => (h[f] === true) !== (b.state[f] === true)))) throw new Error('the header does not describe the block inside it');
  // the block's one signature is the header's (privacy.md, Sealed messages): the plaintext carries none
  return { block: plain.block, signature: msg.header_signature, reveals: plain.reveals, hash };
}
const headerSignedBy = (msg, pubHex) => verifyBytes(Buffer.from(jcs(msg.header), 'utf8'), msg.header_signature, pubHex);
// wrap / unwrap (core.md section 6): a public block as a message
// ---- answering a pull (nodes.md, Pull): the matches in arrival order, each with its arrival number on the log the answer names; a lie travels with its proof.
// `log` entries are { n, block, header?, header_signature?, copies? }: `n` is the arrival number of the block on the log the asker names (the `seq` of the first receipt on it that
// names the block, nodes.md, The arrival log). A block with no receipt on that log has no arrival number there and is not
// served under it (nodes.md, Messages): an entry with no whole n of at least 1 is never served, not even as a pair's proof.
function answerPull(log, request, node, privateKey, choices, asker, heldIn, suite, through) {
  const { cap, serves_pairs: servesPairs } = choices;
  log = (log || []).filter(e => isObj(e) && Number.isInteger(e.n) && e.n >= 1);
  const since = Number(request.since) || 0;
  const limit = request.limit > 0 ? Math.min(request.limit, cap) : cap;
  asker = asker || request.signer;
  const nOf = e => (Number.isInteger(e.n) ? e.n : 0);
  const held = Array.isArray(heldIn) ? poolOf(heldIn) : poolOf(log.map(e => e.block));
  // a filter reads only what the asker may see: a public block whole, a non-public one whole only by an asker it has a copy for,
  // else its public header (author, prev, seq, hash) alone, so a private block held in the clear answers no filter on its content
  // 1.9 3a-5: a node shows a block's body only to an audience it can read: it holds the body, and every commitment of the audience is written in a hash name it knows; a body whose audience it
  // cannot read it shows to no one and passes on as its header. A sealed copy pushed for one person is passed to her as it came: it shows no body (a relay that holds only the copy passes it on)
  const seenBy = e => !Array.isArray(e.block.state.audience) || Boolean(asker && e.copies && e.copies[asker]);
  // 1.9 stage 7 (nodes.md line 37, kept from 1.8 A2): an unsigned pull gets public blocks; a signed pull also gets each sealed block the node holds a copy of for the asker. Nothing of a sealed block goes to any
  // other asker, and for anyone else it matches no filter (no sealed header goes out)
  let found = log.filter(e => nOf(e) > since && seenBy(e) && matches(e.block, request.filter, held)).sort((a, b) => nOf(a) - nOf(b));
  if (request.heads === true) {
    const named = new Set(found.flatMap(e => [...asList(e.block.refs.prev), ...asList(e.block.refs.updates)]));
    found = found.filter(e => !named.has(e.block.hash));
  }
  const full = found.length >= limit;
  found = found.slice(0, limit);
  // an answer that is not full goes on from the last arrival the node read (`through`), so a window that matched nothing still moves on; a request that names in `seen` a
  // receipt on the log the node holds is answered by a node that read at least that far (nodes.md, Pull)
  const last = found.length ? nOf(found[found.length - 1]) : since;
  const seenEntry = isStr(request.seen) ? log.find(e => e.block.hash === request.seen) : undefined;
  const reach = Math.max(Number.isInteger(through) ? through : -Infinity, seenEntry ? nOf(seenEntry) : -Infinity);
  const next = Number.isFinite(reach) && !full ? Math.max(last, reach) : last;
  // a node that serves a pair's proof (its own choice) sends the other half of a pair (one key, one prev or one seq) with a block of it, matched or not, before since or after
  const have = new Set(found.map(e => e.block.hash)), proofs = [];
  if (servesPairs) {
    const pairs = forkPairs(held);
    for (const e of found) for (const p of pairs) if (p.includes(e.block.hash)) {
      const other = p.find(h => h !== e.block.hash), o = log.find(x => x.block.hash === other);
      // a sealed half goes only as the asker may see it: to one the node holds a copy for; nothing of it goes to any other asker (nodes.md)
      if (o && !have.has(other) && seenBy(o) && (o.block.type !== undefined || (asker && o.copies && o.copies[asker]))) { have.add(other); proofs.push(o); }
    }
  }
  found = found.concat(proofs).sort((a, b) => nOf(a) - nOf(b));
  const messageOf = e => {
    const a = e.block.state.audience;
    if (a === 'public' || !Array.isArray(a)) return wrap(e.block);
    const copy = asker && e.copies && e.copies[asker]; // 1.9 3a-5: a sealed copy is passed to the one it was pushed for, as it came
    if (copy) return copy;
    return { header: e.header || header(e.block), header_signature: e.header_signature !== undefined ? e.header_signature : e.block.signature }; // only the proofs of a pair reach here, never a sealed block to a stranger
  };
  // the answer names its log only when the request names one (nodes.md, Messages; protocol.json messages.pull_answer_optional)
  const answer = { node, request: sha256(jcs(request)), ...(isStr(request.log) ? { log: request.log } : {}), blocks: found.map(e => ({ n: nOf(e), message: messageOf(e) })), next };
  // signed by the node when a private key is given (protocol.json door.answer_pull: `signature` only then)
  return isStr(privateKey) ? signMessage(answer, privateKey, suite || 'std') : answer;
}
// the parts a caller gives (taken among them: protocol.json door.ops.push_answer) are sorted as push_answer_order says.
// a node's signed answer to a push (nodes.md, Messages): every key but `receipt` and `held` always present, an empty list [], in the order messages.push_answer_order gives
function buildPushAnswer(parts, node, privateKey, suite) {
  const p = isObj(parts) ? parts : {}, items = k => (Array.isArray(p[k]) ? p[k] : []), id = x => (isObj(x) && x.hash !== undefined ? x.hash : x);
  const byH = (a, b) => cmp(a.hash, b.hash);
  const answer = {
    node,
    taken: items('taken').map(id).sort(),
    unjudged: items('unjudged').map(u => ({ hash: u.hash, needs: [...asList(u.needs)].sort() })).sort(byH),
    refused: items('refused').map(r => ({ hash: r.hash === undefined ? null : r.hash, code: r.code === undefined ? null : r.code, detail: r.detail === undefined ? null : r.detail })).sort((a, b) => cmp(String(a.hash), String(b.hash)) || CODE_ORDER.indexOf(a.code) - CODE_ORDER.indexOf(b.code)),
    unread: items('unread').map(u => ({ hash: u.hash, codes: [...asList(u.codes)].sort((x, y) => READ_ORDER.indexOf(x) - READ_ORDER.indexOf(y)) })).sort(byH),
    equivocations: items('equivocations').map(q => [...asList(q)].sort()).sort((a, b) => cmp(a.join(), b.join())),
  };
  if (isObj(p.receipt)) {
    // 1.9 stage 7 (A2, nodes.md line 15; stage 7 compare, settled): a receipt sealed to a pusher names only what that pusher's push added: one whose refs.derives_from names a block not in this answer's taken is refused
    const d = isObj(p.receipt.refs) ? p.receipt.refs.derives_from : undefined;
    if (d !== undefined && (Array.isArray(d) ? d : [d]).some(x => !answer.taken.includes(x))) throw cryptoError('a receipt to a pusher names only what that pusher\'s push added (nodes.md)', 'shape');
    answer.receipt = p.receipt;
  }
  if (Array.isArray(p.held)) answer.held = [...new Set(p.held.map(id).filter(isStr))].sort();
  return signMessage(answer, privateKey, suite || 'std');
}
// ---- what a node's signed words alone show (nodes.md, The arrival log; door op log_shown): { left_out, stopped_short }. `receipts` are the blocks of one door log the asker holds,
// receipts and `dropped`, as whole blocks (a sealed receipt the asker has opened is { header, header_signature, block }; one still sealed shows nothing).
// log_shown (nodes.md, The arrival log): the receipts are whole blocks, valid with what is held and on the request's log (a receipt held as its header names nothing); the
// answer counts only when it names the request's hash and log and a key that speaks for its node signed it. A block matches the request's filter as the asker may see it: whole
// when public or hers, else by its header; one the checker does not hold, only a request with no filter. A dropped at or below next drops a block it names, or a block its
// receipt names, unless the door's person (the receipt's refs.subject) signed or answered it.
function logShown(receiptsIn, request, answer, heldIn) {
  const none = { left_out: [], stopped_short: false };
  if (!Array.isArray(receiptsIn)) throw argError('receipts is a list of whole blocks');
  if (!isObj(request) || !isObj(answer) || !isStr(request.log) || answer.log !== request.log || answer.request !== sha256(jcs(request))) return none;
  const heldL = heldList(heldIn), held = poolOf(heldL);
  if (!identityFold(answer.node, heldL).keys.some(k => verifyMessage(answer, k))) return none;
  const given = receiptsIn.filter(x => isObj(x) && x.type !== undefined && isObj(x.state) && isObj(x.refs));
  const ctxHeld = [...heldL, ...given];
  const blocks = given.filter(b => !valid(b, ctxHeld).length);
  const onLog = blocks.filter(b => (b.refs.key !== undefined ? b.refs.key : b.refs.author) === request.log);
  const receipts = onLog.filter(b => b.type === 'observe' && b.state.kind === 'receipt' && Number.isInteger(b.state.seq)).sort((a, b) => a.state.seq - b.state.seq);
  const drops = onLog.filter(b => b.type === 'observe' && b.state.kind === 'dropped' && Number.isInteger(b.state.seq) && b.state.seq <= answer.next);
  const since = Number(request.since) || 0, next = answer.next;
  const shownIds = new Set(asList(answer.blocks).map(e => (isObj(e) && isObj(e.message) ? (isObj(e.message.block) ? idOf({ ...e.message.block, signature: e.message.signature }, held) : isObj(e.message.header) ? e.message.header.hash : null) : null)).filter(Boolean));
  const arrival = new Map(), receiptOf = new Map();
  for (const r of receipts) for (const h of asList(r.refs.derives_from)) if (!arrival.has(h)) { arrival.set(h, r.state.seq); receiptOf.set(h, r); }
  const dropNames = new Set(drops.flatMap(d => asList(d.refs.derives_from)));
  const empty = !isObj(request.filter) || !Object.keys(request.filter).length;
  const left_out = [];
  for (const [h, n] of arrival) {
    if (!(since < n && n <= next) || shownIds.has(h)) continue;
    const r = receiptOf.get(h), X = held.get(h), who = r.refs.subject;
    const hers = !!X && (X.refs.author === who || held.all().some(y => y.refs && y.refs.author === who && asList(y.refs.answers).includes(h)));
    if ((dropNames.has(h) || dropNames.has(r.hash)) && !hers) continue;
    if (!X) { if (empty) left_out.push(h); continue; }
    const seenWhole = X.type !== undefined && (!Array.isArray(X.state.audience) || X.refs.author === request.signer);
    if (!matches(seenWhole ? X : asHeader(X), request.filter, held)) continue;
    left_out.push(h);
  }
  let stopped_short = false;
  if (isStr(request.seen)) { const r = receipts.find(x => x.hash === request.seen); stopped_short = !!r && next < r.state.seq && next === since; }
  return { left_out: left_out.sort(), stopped_short };
}
// a message is exactly { block, signature } (core.md, section 6): no suite beside it, so no label gives one signed block a second id
const wrap = b => ({ block: blockOnly(b), signature: b.signature });
function unwrap(m, held) {
  // a message is exactly { block, signature }: any other key, a suite or a version too, refuses it (core.md, section 6; protocol.json messages.public_block)
  if (!isObj(m) || Object.keys(m).some(k => !C.messages.public_block.includes(k)) || !C.messages.public_block.every(k => k in m)) throw cryptoError('a message is exactly { block, signature }', 'shape');
  const b = blockOnly(m.block);
  return { hash: idOf({ ...b, signature: m.signature }, held), ...b, signature: m.signature };
}


// profiles/tasks.md, Sensor conditions: the readings are the observes of the condition's kind that name the sensor in refs.from, with an
// amount in the condition's unit and an at not later than `now`. The window runs from `now` less `over` to `now`. It holds when a reading at or
// before the start exists (it gives the state at the start) and it, and every reading inside the window, keeps to the rule.
function readingConditionHolds(c, blocks, now) {
  if (!c || !isStr(c.reading) || !isStr(c.kind) || !isStr(c.op) || !isStr(c.over) || !c.value || !isStr(c.value.value)) return false;
  if (!RX.duration.test(c.over)) return false;
  const start = addDur(now, c.over, -1);
  if (start === null) return false;
  // a reading counts only if it speaks for the sensor: signed by the sensor itself, or speaking for the sensor's owner (the ownership fold of the
  // sensor thing): her own, or a tool's under her live grant (authority.md, Who a block speaks for). 1.9: the operator grant is gone (04-grants)
  const pool = poolOf(blocks || []);
  const sensorBlock = pool.get(c.reading);
  const owner = sensorBlock && sensorBlock.type === 'thing' ? ownershipFold(sensorBlock, blocks || []).owner : null;
  const operatedBy = (who, r) => isStr(who) && isStr(owner) && (who === owner || speakerOf(r, pool) === owner);
  const rs = (blocks || []).filter(b => b.type === 'observe' && b.state.kind === c.kind && [].concat(b.refs.from || []).includes(c.reading) && (b.refs.author === c.reading || operatedBy(b.refs.author, b))
    && b.state.amount && b.state.amount.unit === c.value.unit && isStr(b.state.amount.value) && isStr(b.state.at) && b.state.at <= now)
    .sort((x, y) => cmp(x.state.at, y.state.at));
  const keeps = r => { const k = decCmp(r.state.amount.value, c.value.value); return P.condition_ops.includes(c.op) && { lt: k < 0, le: k <= 0, gt: k > 0, ge: k >= 0, eq: k === 0 }[c.op] === true; };
  const before = rs.filter(r => r.state.at <= start);
  if (!before.length) return false;
  // the latest reading at or before the window's start; where several share that instant, every one must keep to the rule (tasks.md)
  const last = before[before.length - 1].state.at;
  return rs.filter(r => r.state.at >= last).every(keeps);
}

// ================================================================ large content: the Merkle root (encoding.md, Large content)
// Written from the text: leaf = SHA-256(00 || chunk); node = SHA-256(01 || left || right); an odd one at the end of a level is carried up.
const argError = msg => { const e = new Error(msg); e.kind = 'argument'; return e; };
// a node's own stated choice: a boolean in the object the call takes, never a default
const pairChoice = (choices, name) => { if (!isObj(choices) || typeof choices[name] !== 'boolean') throw argError('choices.' + name + ' is true or false: the node states it'); return choices[name]; };
// a clock (core.md section 3): a time; null or absent is none unless one is needed; anything else is refused at the door
// an arrival log { hash: time }: each arrival is a time, like a clock (folds.md); anything else is refused, never read as a time
const arrivalsArg = v => { if (!isObj(v)) return null; for (const t of Object.values(v)) if (t !== null && (!isStr(t) || !RX.time.test(t) || timeProblem(t))) throw argError('an arrival is a time'); return v; };
const clock = (v, needed) => { if ((v === undefined || v === null) && !needed) return undefined; if (isStr(v) && RX.time.test(v) && !timeProblem(v)) return v; throw argError('a clock is a time'); };
const merkleLeaf = chunk => crypto.createHash('sha256').update(Buffer.concat([Buffer.from([0]), chunk])).digest();
const merkleNode = (l, r) => crypto.createHash('sha256').update(Buffer.concat([Buffer.from([1]), l, r])).digest();
const merkleLevels = chunks => { let level = chunks.map(c => merkleLeaf(Buffer.from(c, 'hex'))); const all = [level]; while (level.length > 1) { const next = []; for (let i = 0; i < level.length; i += 2) next.push(i + 1 < level.length ? merkleNode(level[i], level[i + 1]) : level[i]); level = next; all.push(level); } return all; };
function merkleRoot(chunks) { if (!Array.isArray(chunks) || !chunks.length) throw argError('merkle_root needs at least one chunk'); const lv = merkleLevels(chunks); return lv[lv.length - 1][0].toString('hex'); }
function merkleProof(chunks, index) {
  if (!Array.isArray(chunks) || !Number.isInteger(index) || index < 0 || index >= chunks.length) throw argError('merkle_proof needs an index of a chunk');
  const out = []; let at = index;
  for (const level of merkleLevels(chunks)) { if (level.length === 1) break; if (at % 2 === 1) out.push(level[at - 1].toString('hex')); else if (at + 1 < level.length) out.push(level[at + 1].toString('hex')); at = Math.floor(at / 2); }
  return out;
}
// The reader's check (encoding.md): the block holds exactly one merkle mark, and its state.chunks is the signed count.
function merkleVerify(block, chunk, index, proof) {
  const st = block && block.state;
  if (!isObj(st) || !Array.isArray(st.marks)) return false;
  const roots = st.marks.filter(m => isObj(m) && m.scheme === 'merkle');
  if (roots.length !== 1 || !isStr(roots[0].value) || !Number.isInteger(st.chunks) || st.chunks < 1) return false;
  const root = roots[0].value, count = st.chunks;
  if (!Number.isInteger(index) || index < 0 || index >= count || !Array.isArray(proof) || !/^[0-9a-f]*$/.test(chunk) || chunk.length % 2) return false;
  let h = merkleLeaf(Buffer.from(chunk, 'hex')), at = index, width = count, used = 0;
  while (width > 1) {
    if (at % 2 === 1 || at + 1 < width) { const s = proof[used++]; if (typeof s !== 'string' || !/^[0-9a-f]{64}$/.test(s)) return false; h = at % 2 === 1 ? merkleNode(Buffer.from(s, 'hex'), h) : merkleNode(h, Buffer.from(s, 'hex')); }
    at = Math.floor(at / 2); width = Math.ceil(width / 2);
  }
  return used === proof.length && h.toString('hex') === root;
}

// A release (promises.md, A release) is an observe of kind `release`, signed by the one who lets go. It binds only its signer and lets go only of her
// what is owed to her. With refs.subject it lets go of what is owed to her on that deal or thing. Without, it lets go of what is owed to her on every deal with refs.to (the other
// side) whose first promise it has in its causal past, except the deals state.except lists, which stay open. Only a side of a deal lets go of what is owed to it.
function releaseShown(subject, blocksIn) {
  const pool = new Pool([subject, ...poolOf(blocksIn).all()]);
  const sh = subject.hash;
  const deal = subject.type === 'promise' && subject.refs.answers === undefined;
  const sideOf = id => (!deal ? null : subject.refs.from === id ? 'from' : subject.refs.to === id ? 'to' : null);
  const released = [], kept = [];
  for (const o of pool.all()) {
    if (o.type !== 'observe' || o.state.kind !== 'release' || o.state.status !== undefined || !counts(o, pool)) continue;
    const by = speakerOf(o, pool);
    if (!isStr(by)) continue;
    const side = sideOf(by);
    if (deal && side === null) continue;
    const entry = { block: o.hash, by, side, to: isStr(o.refs.to) ? o.refs.to : null };
    if (o.refs.subject !== undefined) { if (o.refs.subject === sh) released.push(entry); continue; }
    const other = side === 'from' ? subject.refs.to : subject.refs.from;
    if (!deal || !isStr(other) || o.refs.to !== other || !pool.sees(o.hash, sh)) continue;
    if (asList(o.state.except).includes(sh)) kept.push({ block: o.hash, by, side }); else released.push(entry);
  }
  const sorted = l => l.sort((a, b) => cmp(a.block, b.block));
  return { subject: sh, released: sorted(released), kept_open: sorted(kept) };
}

// a condition (promises.md, Conditions), a view on the blocks held and the reader's clock: settled, a deed, a sensor's readings, or a signal
// a condition reads three ways (promises.md, Conditions): true, false (also for one of the four shapes written wrong), or null: a condition of any
// other shape is not read by the protocol
function conditionHolds(c, blocks, runNamed) {
  // 1.9 3c-6: a condition is read on the words in the past of the block that relies on it, never on a reader's clock
  const now = undefined;
  const pool = poolOf(blocks);
  if (!conditionReads(c)) return null;
  // 1.9-GUESS [5-17] R-C3 (D1): `settled`, `paid` and `reading` are named readings: a block whose condition names one states, in `state.rule_set`, the rules that hold it; a reader that does not run them holds the block not read (`unknown_rules`).
  // This reader runs none, and the core alone reads signed fields only: `settled` and `paid` are not read here, in any block (the condition is not read: null, and never holds); `reading` can never be shown (false). `ruled` is read from signed fields (R-H9); the payee's signal, `{ signal: "paid", by: [payee], subject: deal }`, needs no reading.
  // The door op `condition_holds` is a reader that runs the named readings (as the vectors' 1.8 answers have them): `runNamed`.
  if (isStr(c.settled) || isStr(c.paid)) {
    if (runNamed !== true) return null; // the door never runs them (R-C3); a reader that does passes runNamed
    const p = pool.get(isStr(c.settled) ? c.settled : c.paid), v = p && promiseStage(p, pool);
    if (!v || v.not_shown) return false;
    return isStr(c.settled) ? v.stage === 'done' : v.paidUp === true && v.total !== null && v.total !== undefined;
  }
  // accepted: that deal binds, read from its promise fold, no clock (decision H17): accepted or further along, or stopped onward (it bound)
  if ('accepted' in c) { const p = isStr(c.accepted) && pool.get(c.accepted); return !!p && stageBinds(promiseStage(p, pool)); }
  // 1.9-GUESS [5-16] stopped (R-C2): `{ stopped: <first promise>, side: "from" | "to" }` holds where a counted onward stop that speaks for that side is among the first onward stops of that deal and none that speaks for the other side is
  if ('stopped' in c) { const p = isStr(c.stopped) && pool.get(c.stopped); const st = p && p.type === 'promise' ? promiseStage(p, pool) : null; return !!st && !st.not_shown && st.stage === 'stopped' && st.stop === 'onward' && st.by === c.side; }
  if (isStr(c.deed)) { const b = pool.get(c.deed); return !!b && counts(b, pool); }
  // 1.9 3d-16: holds once that id's list is closed, read in the blocks the relying block holds
  if ('closed' in c) return isStr(c.closed) && identityFold(c.closed, pool).closed === true && !!pool.get(c.closed);
  // ruled: the judge's head ruling on the deal awards something to the person (promises.md, Rulings)
  if ('ruled' in c) { const r = ruledFor(c, pool); return !!r && r.ruling !== undefined; }
  // opened: a counted block carries the opening of the commitment (privacy.md): one hash comparison, in the suite the commitment names
  if ('opened' in c) {
    if (!isStr(c.opened)) return false;
    const suite = c.opened.startsWith('sm3:') ? 'sm' : 'std';
    return pool.all().some(b => isObj(b.state.opening) && isStr(b.state.opening.salt) && RX.salt.test(b.state.opening.salt) && b.state.opening.value !== undefined && counts(b, pool) && saltedHash(b.state.opening.salt, b.state.opening.value, suite) === c.opened);
  }
  // by a time (promises.md): within holds when the inner condition held by the deadline, without when it did not
  if ('without' in c || 'within' in c) return byDeadline(c, blocks, pool);
  if (c.reading !== undefined) return null; // 1.9 3c-5/3c-6, R-C3: a bare reading is a named reading the core does not run: not read (it never holds, and can never be shown)
  // a signal (promises.md, Conditions): by a non-empty list of ids, signers a whole number of at least 1, subject one id, op and value
  // together (value an amount); any other shape does not hold
  if (!isStr(c.signal)) return false;
  const nameOk = w => isStr(w) && w !== '' && !w.includes('#'); // 1.9 stage 7: roles are gone, so `circle#role` is no name
  if (!Array.isArray(c.by) || !c.by.length || !c.by.every(nameOk)) return false;
  if (c.signers !== undefined && !(Number.isInteger(c.signers) && c.signers >= 1)) return false;
  // a by that names more than one signer (two ids) states how many (decision F2, as E3): with none, the signal does not hold
  if (c.signers === undefined && c.by.length > 1) return false;
  if (c.subject !== undefined && !isStr(c.subject)) return false;
  const OPS = Object.fromEntries(Object.entries({ lt: k => k < 0, le: k => k <= 0, gt: k => k > 0, ge: k => k >= 0, eq: k => k === 0 }).filter(([k]) => P.condition_ops.includes(k)));
  if ((c.op === undefined) !== (c.value === undefined)) return false;
  if (c.op !== undefined && !(isStr(c.op) && Object.hasOwn(OPS, c.op) && isObj(c.value) && isStr(c.value.value) && RX.decimal.test(c.value.value) && c.value.unit !== undefined)) return false;
  const by = c.by, needed = c.signers === undefined ? 1 : c.signers;
  // the voice is its signer: a signal under a grant speaks for its signer alone (authority.md, Blocks that bind: every block under a grant
  // that is none of those speaks for its signer alone; 04-grants, 1.9)
  const voiceOf = o => o.refs.author;
  // a signer takes their own signal back by defeating it: the defeat is hers when it speaks for the voice the signal speaks for
  const withdrawn = o => pool.all().some(d => asList(d.refs.defeats).includes(o.hash) && voiceOf(d) !== undefined && voiceOf(d) === voiceOf(o) && counts(d, pool));
  const signers = new Set();
  for (const o of pool.all()) {
    if (o.type !== 'observe' || o.state.kind !== c.signal || !counts(o, pool) || withdrawn(o)) continue; // 1.9 3c-6: a signal counts once it is counted, whatever its `at`
    if (c.subject !== undefined && !asList(o.refs.subject).includes(c.subject)) continue;
    if (c.op !== undefined) { const a = o.state.amount; if (!isObj(a) || jcs(a.unit) !== jcs(c.value.unit) || !tableEntry(OPS, c.op) || OPS[c.op](decCmp(a.value, c.value.value)) !== true) continue; }
    const author = voiceOf(o);
    if (by.some(w => w === author)) signers.add(author);
  }
  return quorum(signers, needed);
}

// the protocol reads a condition when it has a key of condition_shapes, and a wrapper only around one it reads
const conditionReads = c => isObj(c) && ('without' in c || 'within' in c ? conditionReads('without' in c ? c.without : c.within) : (P.condition_shapes.some(k => k in c) || 'closed' in c)); // 1.9 3d-16: `{ closed: <id> }` holds once that id's list is closed
// what is wrong with a condition's shape, for the shapes the check reads (without, within, opened, paid): null when well formed
function conditionProblem(c) {
  if (!isObj(c)) return null;
  if ('without' in c || 'within' in c) {
    if (Object.keys(c).some(k => !['without', 'within', 'deadline', 'clocks'].includes(k)) || ('without' in c && 'within' in c)) return 'shape';
    if (!(isStr(c.deadline) && timeProblem(c.deadline) === null) || clocksOf(c.clocks) === null) return 'shape';
    const inner = 'without' in c ? c.without : c.within;
    return isObj(inner) ? conditionProblem(inner) : 'shape';
  }
  if ('opened' in c && !(isStr(c.opened) && RX.id.test(c.opened))) return 'shape';
  if ('closed' in c && !(isStr(c.closed) && RX.id.test(c.closed))) return 'shape';
  if ('paid' in c && !(isStr(c.paid) && RX.id.test(c.paid))) return 'shape';
  if ('stopped' in c && !(isStr(c.stopped) && RX.id.test(c.stopped) && (c.side === 'from' || c.side === 'to') && Object.keys(c).every(k => k === 'stopped' || k === 'side'))) return 'shape';
  return null;
}
// the clock a block is a block of (blocks.md, A named clock): each name is a block id and names a line, that block's key's blocks after it (a person's id names
// her genesis key's line); the name, which counts once (folds.md, Counts: a count counts ids), or null.
// 1.9 3d-3: a clock is a line the word's signer named. `clockLine(name, pool)`: the counted blocks on the line a name names, read as it goes on. A person's id names her line, whatever key of her list signs (a wait on a clock whose owner
// changed keys is no longer stuck); a key grant that adds one key under a voice names that key's line; any other block names its key's blocks after it. A receipt counts only where its key spoke for the clock's owner at that block (`counts`).
function clockLine(name, pool) {
  pool._cl = pool._cl || new Map();
  if (pool._cl.has(name)) return pool._cl.get(name);
  const B = pool.get(name); let list = [];
  if (B) {
    if (B.type === 'actor' && B.refs.author === undefined) list = pool.all().filter(o => o.refs.author === B.hash && o.hash !== B.hash && counts(o, pool));
    else if (isKeyGrant(B) && !Array.isArray(B.state.voices) && isStr(B.state.public_key_sign) && isStr(B.refs.subject)) list = pool.all().filter(o => o.refs.author === B.refs.subject && o.hash !== name && counts(o, pool) && signerKeyOf(o, pool) === B.state.public_key_sign);
    else if (isStr(B.refs.author)) { const k = signerKeyOf(B, pool); list = pool.all().filter(o => o.hash !== name && o.refs.author === B.refs.author && signerKeyOf(o, pool) === k && pool.sees(o.hash, name) && counts(o, pool)); }
  }
  pool._cl.set(name, list);
  return list;
}
// the clock a block is a block of: the name whose line holds it, or null
function clockVoice(o, ks, pool) {
  for (const n of ks.names) if (clockLine(n, pool).includes(o) || clockLine(n, pool).some(x => x.hash === o.hash)) return n;
  return null;
}
// a receipt's place on a line is its time: one receipt is before another where the other has it in its causal past (3b-4); its `at` orders nothing
const placedBefore = (pool, x, y) => pool.sees(y.hash, x.hash);
const receiptsOn = (name, h, pool) => clockLine(name, pool).filter(o => o.type === 'observe' && o.state.kind === 'receipt' && asList(o.refs.derives_from).includes(h));
// 1.9 3d-4: a cutoff, on its line, is that time's place. A cutoff whose own `at` is before its `when` closes nothing: its own date shows it early, against its own signer. 1.9-GUESS [3d-4]: a cutoff that states no `at`, or whose `when` is no time, closes nothing too (nothing fills a silence)
const cutoffsOn = (name, pool) => clockLine(name, pool).filter(o => o.type === 'observe' && o.state.kind === 'cutoff' && isStr(o.state.when) && timeProblem(o.state.when) === null && (o.state.at === undefined || (isStr(o.state.at) && o.state.at >= o.state.when))); // 1.9 3d-4: a cutoff that states no `at` is not shown early (a missing `at` reads as a late one, 3d-2)
// on one line, the place of a block against a stated time: 'in' (a receipt of it before a cutoff of the time), 'late' (a receipt after one), or null (the line has not shown it)
function lineVerdict(name, h, deadline, pool) {
  const cuts = cutoffsOn(name, pool).filter(c => c.state.when >= deadline), rs = receiptsOn(name, h, pool);
  // 1.9 stage 5 (R-B1, as 3c-6's compare built it): a cutoff is the time's place on its line, read whole: a receipt with no cutoff of the time before it came before the time
  if (!cuts.length) return rs.length ? 'in' : null;
  if (rs.some(r => cuts.some(c => placedBefore(pool, r, c)))) return 'in';
  if (rs.some(r => cuts.some(c => placedBefore(pool, c, r)))) return 'late';
  return null;
}
// 1.9 3d-5, 3d-6: whether an end came first for a block on a clock, the reading that keeps a thing in its signer's hand: `names` less `needed`, plus one, lines each hold
// a receipt of the block, every one with a receipt of the end at or before it, and one with a receipt of the end strictly before it
function endFirstOn(block, end, ks, pool) {
  let n = 0;
  for (const name of ks.names) {
    const rb = receiptsOn(name, block, pool); if (!rb.length) continue;
    const re = receiptsOn(name, end, pool);
    const atOrBefore = r => re.some(e => e.hash === r.hash || placedBefore(pool, e, r));
    if (rb.some(r => !atOrBefore(r))) continue;
    if (rb.some(r => re.some(e => placedBefore(pool, e, r)))) n++;
  }
  return n >= ks.names.length - ks.needed + 1;
}
// whether `needed` of the clocks' lines show the block received before a cutoff of the stated time (it is in time on that clock)
const inTimeByClock = (h, ks, pool, deadline) => ks.names.filter(n => lineVerdict(n, h, deadline, pool) === 'in').length >= ks.needed;
// the needed-th time among the clocks: each clock counts once, at its earliest time (its latest, for a cutoff)
function kth(voices, needed, latest) {
  const m = new Map();
  for (const [v, t] of voices) { const c = m.get(v); if (c === undefined || (latest ? t > c : t < c)) m.set(v, t); }
  const ts = [...m.values()].sort(); if (latest) ts.reverse();
  return needed <= ts.length ? ts[needed - 1] : null;
}
// when `needed` clocks had each received the block: their counted receipts (observe kind receipt, derives_from the block, state.at)
function receivedAt(target, ks, pool) {
  const voices = [];
  for (const o of pool.all()) { if (o.type !== 'observe' || o.state.kind !== 'receipt' || !asList(o.refs.derives_from).includes(target) || !isStr(o.state.at) || !counts(o, pool)) continue; const v = clockVoice(o, ks, pool); if (v !== null) voices.push([v, o.state.at]); }
  return kth(voices, ks.needed, false);
}
// a price fixed later (promises.md, Terms, `price`): null when the price is a plain number; else { fixed: false } until the price is fixed, and
// { fixed: true, price: amount } once it is. The price names a figure: an observe of kind `figure` made for the deal, with state.amount, signed by one
// of the readers `by` names, received by `deadline` on the named clock `clocks`, and inside `min` and `max` when it names them. It is fixed when
// `signers` different readers each signed the same figure and no other figure reached that many; a reader who signed two different figures counts for
// neither. The price is the figure, or `fraction` of it, exact. Nothing is filled in.
function fixingOf(terms, P, pool) {
  const p = terms.price;
  if (!isObj(p) || !('figure' in p)) return null;
  if (figureProblems(p).length) return { fixed: false };
  const ks = clocksOf(p.clocks), by = { names: p.by, needed: 1 };
  const inside = (k, m, bad) => p[k] === undefined || (isAmount(p[k]) && sameKind(p[k], m) && !bad(dec(m.value), dec(p[k].value)));
  const votes = [];
  for (const o of pool.all()) {
    if (o.type !== 'observe' || o.state.kind !== p.figure || !asList(o.refs.for).includes(P.hash) || !counts(o, pool)) continue;
    const reader = clockVoice(o, by, pool);
    if (reader === null) continue;
    const m = o.state.amount;
    if (!isAmount(m) || fcmp(dec(m.value), F0) < 0) continue;
    if (ks === null || !inTimeByClock(o.hash, ks, pool, p.deadline) || !inside('min', m, (v, b) => fcmp(v, b) < 0) || !inside('max', m, (v, b) => fcmp(v, b) > 0)) continue;
    votes.push({ reader, key: jcs(m), m });
  }
  const uniq = votes.filter((v, i) => votes.findIndex(w => w.reader === v.reader && w.key === v.key) === i);
  const once = uniq.filter(v => uniq.filter(w => w.reader === v.reader).length === 1);
  const reached = [];
  for (const v of once) if (once.filter(w => w.key === v.key).length >= p.signers && !reached.some(r => r.key === v.key)) reached.push(v);
  if (reached.length !== 1) return { fixed: false };
  const m = reached[0].m;
  const total = p.fraction !== undefined ? fmul(dec(m.value), dec(p.fraction)) : dec(m.value);
  return { fixed: true, price: amtOut(total, kindOf(m)) };
}
// the blocks that decide a condition, which a clock must have dated for it to hold by a time
function deciders(c, pool) {
  if ('without' in c || 'within' in c) return deciders('without' in c ? c.without : c.within, pool);
  for (const k of ['settled', 'accepted', 'paid']) if (isStr(c[k])) return pool.all().filter(b => b.hash !== c[k] && asList(b.refs.for).includes(c[k]) && !(b.type === 'observe' && (b.state.kind === 'receipt' || b.state.kind === 'cutoff'))).map(b => b.hash);
  if (isStr(c.deed)) return [c.deed];
  const kind = isStr(c.signal) ? c.signal : c.reading !== undefined && isStr(c.kind) ? c.kind : null;
  if (kind !== null) return pool.all().filter(b => b.type === 'observe' && b.state.kind === kind).map(b => b.hash);
  if ('opened' in c) return pool.all().filter(b => b.state.opening !== undefined).map(b => b.hash);
  if ('ruled' in c) return pool.all().filter(b => b.type === 'observe' && b.state.kind === 'ruling').map(b => b.hash);
  return [];
}
// 1.9 3d-4, 3d-5, 3c-5: a time in a condition is shown only by its clock's cutoffs, each line by its place. A line that has a cutoff of the time has spoken: it reads `yes` (the inner condition holds on what that line shows
// received before the cutoff) or `no`. On a clock, `needed` lines must show the reading that moves a thing out of its signer's hand (`within`: yes; `without`: no); the other reading takes `names` less `needed`, plus one.
function deadlineReading(c, pool) {
  const negate = 'without' in c, inner = negate ? c.without : c.within, ks = clocksOf(c.clocks);
  const dec = new Set(deciders(inner, pool));
  let yes = 0, no = 0;
  for (const n of ks.names) {
    // a line speaks `yes` where the inner condition holds on what it shows before the time (a decider received with no cutoff of the time before it), and `no` once it holds the cutoff
    const cut = cutoffsOn(n, pool).some(x => x.state.when >= c.deadline);
    const inTime = pool.all().filter(b => !dec.has(b.hash) || lineVerdict(n, b.hash, c.deadline, pool) === 'in');
    if (conditionHolds(inner, inTime) === true) yes++; else if (cut) no++;
  }
  return { negate, ks, yes, no, move: negate ? no : yes, other: negate ? yes : no, narrow: ks.names.length - ks.needed + 1 };
}
function byDeadline(c, blocks, pool) {
  if (conditionProblem(c)) return false;
  const r = deadlineReading(c, pool);
  return r.move >= r.ks.needed;
}
// 1.9 3c-5: whether a condition can no longer hold, read only from the clock's own readings: for `within`, its no-reading; for `without`, the yes-reading of its inner condition. A condition that can never be shown (a bare `reading`) can no longer hold from its signing.
function conditionDead(c, blocks) {
  if (!isObj(c)) return false;
  const pool = poolOf(blocks);
  if ('without' in c || 'within' in c) {
    if (conditionProblem(c)) return false;
    const r = deadlineReading(c, pool);
    return r.other >= r.narrow;
  }
  return c.reading !== undefined; // 1.9-GUESS [3c-5]: only a bare `reading` is read as never shown here ("a bench of none" is a stage-5 shape)
}
// the pure functions read only what the write check takes (folds.md, What each fold returns): terms_total judges the terms it reads (price, quantity,
// lines) as an offer's and the quantity chosen as an accept's; limit_within_parent judges each fence as a grant's scope. Junk reads as absent.
const pureJunk = (() => {
  const AT = '2026-01-01T00:00:00.000Z', id = c => c.repeat(64);
  const refused = (type, state, refs) => writeFindings({ type, state, refs }).length > 0;
  const terms = (t, quantity) => {
    if (!isObj(t)) return true;
    const read = Object.fromEntries(Object.entries(t).filter(([k]) => ['price', 'quantity', 'lines'].includes(k)));
    const whats = Array.isArray(t.lines) && t.lines.every(x => isObj(x) && isStr(x.what)) ? [...new Set(t.lines.map(x => x.what))].sort() : [id('3')];
    let junk = refused('promise', { seq: 1, at: AT, audience: 'public', terms: read }, { author: id('1'), prev: id('1'), from: id('1'), what: whats.length === 1 ? whats[0] : whats });
    if (quantity !== undefined && quantity !== null) junk = junk || refused('promise', { seq: 1, at: AT, audience: 'public', status: 'accepted', terms: { quantity } }, { author: id('1'), prev: id('1'), answers: id('4'), for: id('4') });
    return junk;
  };
  const fence = x => {
    const f = isObj(x) && isObj(x.state) ? x.state : x;
    if (!isObj(f)) return true;
    const scope = { ...Object.fromEntries(Object.entries(f).filter(([k]) => ['limit', 'each', 'every'].includes(k))), until: AT };
    return refused('grant', { seq: 1, at: AT, audience: 'public', kind: 'fence', scope }, { author: id('1'), prev: id('1'), to: id('2') });
  };
  return { terms, fence };
})();
// the blocks held with `b` read among them, in place of any other of its hash: a block no node would take is no word
const readWith = (blocks, b) => new Pool([...poolOf(blocks).all().filter(x => x.hash !== b.hash), b]);
// ---- the schema store (core.md, section 8): every thing of kind schema among the blocks held, once per id, ids ascending. Whose signature it carries is
// never read: a schema's id says what its bytes declare (spec/schemas/README.md).
function schemasFrom(held) {
  if (!Array.isArray(held)) throw argError('held is a list of blocks');
  const store = new Map();
  for (const b of held) if (isObj(b) && b.type === 'thing' && isObj(b.state) && b.state.kind === 'schema' && isStr(b.hash) && b.hash !== '') store.set(b.hash, b);
  return [...store.keys()].sort().map(k => store.get(k));
}
// ---- calendar repeats (promises.md, Terms: repeat, zone): written from the RFC 5545 text, a day at a time: each local date is asked "does the rule
// name you?", never stepped by period arithmetic. The zone is read through the host's IANA database (Intl).
const RR_DAY = 86400000;
const RR_WD = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 0 };
// the zone's offset from UTC at an instant, in ms: the wall clock read as if it were UTC, less the instant
const rrOffset = (zone, ms) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second)) - Math.floor(ms / 1000) * 1000;
};
// the instant of a wall time: in a jump it is that wall time by the offset before the jump; when repeated, its first
const rrInstant = (zone, wall) => {
  const before = rrOffset(zone, wall - RR_DAY), after = rrOffset(zone, wall + RR_DAY);
  const ok = [before, after].filter((o, i, all) => all.indexOf(o) === i).map(o => wall - o).filter(t => rrOffset(zone, t) === wall - t);
  return ok.length ? Math.min(...ok) : wall - before;
};
function repeatOccurrences(promise, from, to) {
  const st = promise && promise.state, terms = st && st.terms;
  if (!isStr(st && st.when) || timeMs(st.when) === null) throw argError('the promise\'s state.when is a time');
  if (!terms || !isStr(terms.repeat)) throw argError('the promise\'s terms.repeat is an RRULE text');
  if (!isStr(terms.zone)) throw argError('a calendar repeat is read in terms.zone');
  const zone = terms.zone;
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); } catch { throw argError('a time zone not in the database'); }
  const parts = terms.repeat.split(';').map(x => x.split('='));
  if (parts.some(x => x.length !== 2)) throw argError('parts are KEY=VALUE');
  const R = {};
  parts.forEach(([k, v], i) => {
    if (k in R) throw argError('a part twice');
    if (k === 'RSCALE') { if (i !== 0 || v !== 'GREGORIAN') throw argError('Gregorian only'); return; }
    if (k === 'SKIP') { if (v !== 'OMIT') throw argError('SKIP'); return; }
    if (!['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'BYMONTH', 'BYMONTHDAY', 'BYYEARDAY', 'BYDAY', 'BYHOUR', 'BYMINUTE', 'BYSECOND', 'BYSETPOS', 'WKST'].includes(k)) throw argError('a part not read');
    R[k] = v;
  });
  const freqs = ['SECONDLY', 'MINUTELY', 'HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
  if (!freqs.includes(R.FREQ)) throw argError('FREQ');
  if (R.COUNT !== undefined && R.UNTIL !== undefined) throw argError('COUNT and UNTIL');
  const num = (k, lo, hi) => (R[k] === undefined ? [] : R[k].split(',').map(x => { const n = Number(x); if (!/^-?\d+$/.test(x) || n < lo || n > hi || (n === 0 && lo < 0)) throw argError(k); return n; }));
  const interval = R.INTERVAL === undefined ? 1 : Number(R.INTERVAL);
  if (!Number.isInteger(interval) || interval < 1) throw argError('INTERVAL');
  const count = R.COUNT === undefined ? Infinity : Number(R.COUNT);
  if (!(count >= 1)) throw argError('COUNT');
  const byMonth = num('BYMONTH', 1, 12), byMD = num('BYMONTHDAY', -31, 31), byYD = num('BYYEARDAY', -366, 366), byHour = num('BYHOUR', 0, 23), byMin = num('BYMINUTE', 0, 59), bySec = num('BYSECOND', 0, 59), bySet = num('BYSETPOS', -366, 366);
  const wkst = R.WKST === undefined ? 1 : tableEntry(RR_WD, R.WKST);
  if (wkst === undefined) throw argError('WKST');
  const byDay = R.BYDAY === undefined ? [] : R.BYDAY.split(',').map(x => { const m = /^(-?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/.exec(x); if (!m || m[1] === '0') throw argError('BYDAY'); return { n: m[1] === undefined ? null : Number(m[1]), wd: RR_WD[m[2]] }; });
  const freq = freqs.indexOf(R.FREQ);
  if (byDay.some(d => d.n !== null) && freq < 5) throw argError('BYDAY number');
  if (freq < 3 && bySet.length) throw argError('BYSETPOS');
  let untilWall = null, untilInstant = null;
  if (R.UNTIL !== undefined) {
    const m = /^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)(Z)?)?$/.exec(R.UNTIL);
    if (!m) throw argError('UNTIL');
    const w = Date.UTC(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 23, m[5] ? +m[5] : 59, m[6] ? +m[6] : 59, m[4] ? 0 : 999);
    if (m[7]) untilInstant = w; else untilWall = w;
  }
  const f = timeMs(from), t = timeMs(to);
  if (f === null || t === null) throw argError('from and to are times');
  const start = timeMs(st.when), startWall = start + rrOffset(zone, start);
  const sd = new Date(startWall), sDay = Math.floor(startWall / RR_DAY), sTime = startWall - sDay * RR_DAY;
  const out = [];
  let counted = 0;
  const wdOf = day => new Date(day * RR_DAY).getUTCDay();
  const ymd = day => { const d = new Date(day * RR_DAY); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }; };
  const dim = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const diy = y => ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365);
  const doy = day => day - Math.floor(Date.UTC(ymd(day).y, 0, 1) / RR_DAY) + 1;
  const accept = (wall, instant) => {
    if (untilInstant !== null && instant > untilInstant) return 'end';
    if (untilWall !== null && wall > untilWall) return 'end';
    if (instant >= t) return 'end';
    counted++;
    if (instant >= f) out.push(new Date(instant).toISOString());
    return counted >= count ? 'end' : 'go';
  };
  const dayLimits = day => {
    const { y, m, d } = ymd(day), ds = dim(y, m), ys = diy(y);
    return (!byMonth.length || byMonth.includes(m)) && (!byYD.length || byYD.some(n => (n > 0 ? n === doy(day) : ys + 1 + n === doy(day)))) && (!byMD.length || byMD.some(n => (n > 0 ? n === d : ds + 1 + n === d)));
  };
  const dayOk = day => {
    if (!dayLimits(day)) return false;
    const { y, m, d } = ymd(day), wd = wdOf(day), ds = dim(y, m), ys = diy(y);
    if (byDay.length) {
      const inMonth = freq === 5 || byMonth.length > 0, pos = inMonth ? d : doy(day), size = inMonth ? ds : ys;
      if (!byDay.some(x => x.wd === wd && (x.n === null || (x.n > 0 ? Math.floor((pos - 1) / 7) + 1 === x.n : -(Math.floor((size - pos) / 7) + 1) === x.n)))) return false;
    }
    const anyDay = byMD.length || byDay.length || byYD.length;
    if (freq === 4 && !byDay.length) return wd === sd.getUTCDay();
    if (freq === 5 && !anyDay) return d === sd.getUTCDate();
    if (freq === 6 && !anyDay) return d === sd.getUTCDate() && (byMonth.length > 0 || m === sd.getUTCMonth() + 1);
    return true;
  };
  if (freq < 3) {
    const unit = [1000, 60000, 3600000][freq] * interval;
    for (let n = 0; ; n++) {
      const instant = start + n * unit;
      if (instant >= t) break;
      const wall = instant + rrOffset(zone, instant), day = Math.floor(wall / RR_DAY), tod = wall - day * RR_DAY;
      const ok = dayLimits(day) && (!byDay.length || byDay.some(x => x.wd === wdOf(day))) && (!byHour.length || byHour.includes(Math.floor(tod / 3600000))) && (!byMin.length || byMin.includes(Math.floor(tod / 60000) % 60)) && (!bySec.length || bySec.includes(Math.floor(tod / 1000) % 60));
      if (ok && accept(wall, instant) === 'end') break;
      if (n > 5000000) throw argError('too many steps');
    }
    return out;
  }
  // a period's number: the day, the week (from WKST), the month or the year, counted from the start's
  const week0 = sDay - ((sd.getUTCDay() - wkst + 7) % 7);
  const periodOf = day => (freq === 3 ? day - sDay : freq === 4 ? Math.floor((day - week0) / 7) : freq === 5 ? (ymd(day).y - sd.getUTCFullYear()) * 12 + ymd(day).m - sd.getUTCMonth() - 1 : ymd(day).y - sd.getUTCFullYear());
  const hours = byHour.length ? byHour : [Math.floor(sTime / 3600000)], mins = byMin.length ? byMin : [Math.floor(sTime / 60000) % 60], secs = bySec.length ? bySec : [Math.floor(sTime / 1000) % 60], sub = sTime % 1000;
  let group = [], groupKey = null;
  const flush = () => {
    let set = [...new Set(group)].sort((a, b) => a - b);
    if (bySet.length) set = [...new Set(bySet.map(p => set[p > 0 ? p - 1 : set.length + p]).filter(x => x !== undefined))].sort((a, b) => a - b);
    group = [];
    for (const wall of set) { if (wall < startWall) continue; if (accept(wall, rrInstant(zone, wall)) === 'end') return true; }
    return false;
  };
  const last = Math.floor(t / RR_DAY) + 2;
  for (let day = sDay - 400; day <= last; day++) {
    const p = periodOf(day);
    if (groupKey !== null && p !== groupKey && flush()) return out;
    groupKey = p;
    if (p < 0 || p % interval !== 0 || !dayOk(day)) continue;
    for (const h of hours) for (const mi of mins) for (const se of secs) group.push(day * RR_DAY + h * 3600000 + mi * 60000 + se * 1000 + sub);
  }
  flush();
  return out;
}
// ================================================================ the short reply (profiles/short-form.md, way 1)
// Her key signs her answer as any key signs a block. Only what the receiver cannot rebuild travels: `FB1 ` and base64url of the signature (64), the first 5 bytes of the
// id of the block answered, the answer (01 accepted, 02 declined), `at` (6 bytes, ms since 1970, big-endian; all zero when a decline carries none), `seq` (the rest, big-endian).
// The receiver takes each held block with that code, fills the answer template with the signer's id, the signer's head it holds, refs.key from her list it holds (none for
// her genesis key) and these values, and checks it: the block whose signature opens is the block. Returns { hash, block, answer, valid } or null when none opens.
// The short reply (profiles/short-form.md, way 1): the text of a signed accept or decline, `FB1 ` and base64url of the signature, the first 5 bytes of the id
// answered, the answer, `at` (6 bytes, all zero when a decline carries none) and `seq` (no leading zero); null for a block that is no such answer.
function shortReplyText(b) {
  const prof = C.profiles['short-form'].short_reply;
  if (!isObj(b) || !isObj(b.state) || !isObj(b.refs) || !isStr(b.signature) || !isStr(b.refs.answers)) return null;
  const code = Object.keys(prof.answers).find(k => prof.answers[k] === b.state.status);
  const seq = b.state.seq;
  if (!code || !Number.isInteger(seq) || seq < 0) return null;
  let ms = 0;
  if (isStr(b.state.at)) ms = Date.parse(b.state.at); else if (b.state.status !== 'declined') return null;
  const at = Buffer.alloc(6); at.writeUIntBE(ms, 0, 6);
  let seqHex = BigInt(seq).toString(16); if (seqHex.length % 2) seqHex = '0' + seqHex;
  const bytes = Buffer.concat([Buffer.from(b.signature, 'hex'), Buffer.from(b.refs.answers.replace(/^[a-z0-9-]+:/, ''), 'hex').subarray(0, 5), Buffer.from(code, 'hex'), at, Buffer.from(seqHex, 'hex')]);
  return prof.prefix + bytes.toString('base64url');
}
// A short reply rebuilt: for each held block whose id starts with the 5 bytes, the template is filled with the signer's id, the head of each key of hers held (or the
// block that brought the key in), `refs.key` the key grant that brought that key in (none for her genesis key), and the reply's values. An accept is a `promise`
// whose `for` is the block answered and whose `derives_from` is a list of one id, a `readback` `for` that block; a decline an `observe` with neither. The block whose
// signature opens is the block; null when none opens.
function shortReplyOpen(text, signerId, heldIn) {
  const pool = poolOf(heldIn), prof = C.profiles['short-form'].short_reply;
  if (!isStr(text) || !text.startsWith(prof.prefix)) return null;
  // 1.9 3a-10: a short reply opens only from its exact spelling: strict base64url, no padding, `seq` in its fewest bytes
  const body = text.slice(prof.prefix.length);
  if (!/^[A-Za-z0-9_-]*$/.test(body)) return null;
  const raw = Buffer.from(body, 'base64url');
  if (raw.toString('base64url') !== body) return null;
  if (raw.length < 77 || (raw.length > 77 && raw[76] === 0)) return null;
  const sig = raw.subarray(0, 64).toString('hex'), code = raw.subarray(64, 69).toString('hex'), status = prof.answers[raw.subarray(69, 70).toString('hex')], ms = raw.readUIntBE(70, 6), seq = Number(BigInt('0x' + raw.subarray(76).toString('hex')));
  if (!status) return null;
  const root = pool.get(signerId);
  if (!soundGenesis(root)) return null;
  const options = [{ key: root.state.public_key_sign, suite: root.state.suite || 'std', kg: null, bringer: root }];
  for (const kg of pool.all()) if (keyGrantOf(kg, signerId)) for (const k of keysBroughtBy(kg, signerId)) options.push({ key: k.key, suite: k.suite, kg, bringer: kg });
  for (const cand of pool.all()) {
    if (cand.hash.replace(/^[a-z0-9-]+:/, '').slice(0, 10) !== code) continue;
    const rbs = status === 'accepted' ? pool.all().filter(x => x.type === 'observe' && x.state.kind === 'readback' && asList(x.refs.for).includes(cand.hash)) : [null];
    for (const o of options) {
      const mine = pool.all().filter(x => x.refs.author === signerId && x.hash !== signerId && Number.isInteger(x.state.seq) && x.state.seq < seq && (() => { const s = signerFrom(x, pool); return !!s && s.key === o.key; })()).sort((a, b) => b.state.seq - a.state.seq);
      const head = mine[0] || o.bringer;
      for (const rb of rbs) {
        const refs = { answers: cand.hash, author: signerId, for: cand.hash, prev: head.hash, ...(o.kg ? { key: o.kg.hash } : {}), ...(rb ? { derives_from: [rb.hash] } : {}) };
        const state = { audience: 'public', seq, status, ...(ms !== 0 || status === 'accepted' ? { at: new Date(ms).toISOString() } : {}) };
        const block = { type: status === 'accepted' ? 'promise' : 'observe', state, refs };
        if (verifyBlock(block, sig, o.key, o.suite)) return { hash: hashOfBlock(block, o.suite), ...block, signature: sig };
      }
    }
  }
  return null;
}
// ================================================================ a line read whole (folds.md, A line)
// walkLine(pool, id, start): the line from `id` back by prev until `start` (null: until the line begins), both ends included, each block held, valid and read. `lacks` lists, in the
// order the walk meets them, each block it would need: its id where a held block's prev names it, or where it is held only as its header or not read; and past a block not held,
// { author, key, seq } (`key` the id of the key grant that brought the key in, null for the genesis key) for each seq below the missing one down to the next block of that key
// held, or to the start, the walk going on from that block (none when the block that names the missing one states skip). A seq that jumps with no skip leaves no hole: the line
// is what prev joins. A line goes on past a key's replacement: at the key grant that brought in a block's key (its prev), the walk goes on from the block that key grant names in
// state.counted_to, else from the key grant itself (the old key signed it). A block not valid is not held.
// Two key grants that continue one line are identity's (a pair of that voice); two accepts or take-ups apart are no pair (folds.md, A line; What is left, One start): a pair is two blocks of one key on one prev or seq.
function walkLine(pool, id, start, asked) {
  const lacks = [], seen = new Set(), path = [];
  const keyOf = e => { const k = keyRefOf(e); return k === undefined ? null : k; };
  const seqOf = e => (isObj(e.state) && Number.isInteger(e.state.seq) ? e.state.seq : 0);
  let cur = pool.get(id);
  if (!cur) return { reached: false, ended: false, lacks: [id], path };
  for (;;) {
    if (seen.has(cur.hash)) throw argError('the line runs in a ring');
    seen.add(cur.hash); path.push(cur.hash);
    // 3b-7: a block held and not read hides each id in its refs; one held only as its header hides what the key's line held at its place. With a thing asked about, a block held as a body hides only where it names it
    if (cur.type === undefined && !(asked !== undefined && cur._body && !namedIds(cur._body).includes(asked))) lacks.push(cur.hash);
    if (cur.hash === start) return { reached: true, ended: false, lacks, path };
    // 1.9 stage 6 (A line goes on, C21): a block `as` a circle that names in `state.counted_to` the last block of the old line that counts is read on from that block
    if (isStr(cur.refs.as) && isStr(cur.state.counted_to)) { const X = pool.get(cur.state.counted_to); if (X && X.hash !== cur.hash) { cur = X; continue; } if (!X) { lacks.push(cur.state.counted_to); return { reached: cur.state.counted_to === start, ended: false, lacks, path }; } }
    const prev = cur.refs.prev;
    if (!isStr(prev)) return { reached: false, ended: true, lacks, path };
    const kg = pool.get(prev);
    const next = keyRefOf(cur) === prev && kg && isObj(kg.state) && isStr(kg.state.counted_to) ? kg.state.counted_to : prev;
    const n = pool.get(next);
    // 3b-1: a `prev` that names a block of another person (not her genesis, not a key grant about her) leaves her key's line: the walk ends there
    // (end pass 2026-11-20, as the core reads a line: such a draw is on no line of hers)
    // (a header held under that id naming another author is no block of her line: her block there is not held, and the walk lacks it; a header
    // proves nothing of the block its id names, where a body held and not read shows its author by its own bytes, and leaves her line as any)
    if (n && n.type === undefined && !n._body && isObj(n.refs) && n.refs.author !== undefined && n.refs.author !== cur.refs.author) { lacks.push(next); return { reached: false, ended: false, lacks, path }; }
    if (n && isObj(n.refs) && n.refs.author !== undefined && n.refs.author !== cur.refs.author && n.hash !== cur.refs.author && !(n.type === 'grant' && n.refs.subject === cur.refs.author)) return { reached: false, ended: true, lacks, path };
    if (n) { cur = n; continue; }
    lacks.push(next);
    if (next === start) return { reached: true, ended: false, lacks, path };
    const author = cur.refs.author, key = keyOf(cur), seq = seqOf(cur);
    const same = e => isObj(e.refs) && e.refs.author === author && keyOf(e) === key;
    let below = null;
    for (const e of pool.all()) if (same(e) && seqOf(e) >= 1 && seqOf(e) < seq - 1 && (!below || seqOf(e) > seqOf(below))) below = e;
    const st = isStr(start) ? pool.get(start) : undefined;
    const floor = below ? seqOf(below) : st && same(st) ? seqOf(st) : 0;
    if (cur.state.skip !== true) for (let k = seq - 2, c = 0; k > floor && c < P.limits.gaps_max; k--, c++) lacks.push({ author, key, seq: k });
    if (!below) return { reached: false, ended: false, lacks, path };
    cur = below;
  }
}
function readWhole(blockId, startId, heldIn) {
  if (!isStr(blockId) || !isStr(startId)) throw argError('read_whole names a block and a start by id');
  const pool = poolOf(heldIn), r = walkLine(pool, blockId, startId);
  if (!r.reached && !r.lacks.length) throw argError('the start is not on the block\'s line');
  return { whole: r.reached && !r.lacks.length, lacks: r.lacks };
}

// onLine(block, start, held, answer): the shape every fold gives (folds.md, A line): a fold that reads an order, a sum or what a key had seen answers only on the line it names, read
// whole from the block back to the line's start; otherwise { not_shown: true, lacks } and nothing else. `answer` is the fold's own answer, asked only when the line is whole. Stages 3 to 6
// say which fold reads which line; this is the one rule they all call.
// No fold in this oracle reads an order, a sum or what a key had seen yet (stages 3 to 6 say which line each reads): this helper is the one shape they all give.
function onLine(blockId, startId, heldIn, answer) {
  const r = readWhole(blockId, startId, heldIn);
  return r.whole ? answer() : { not_shown: true, lacks: r.lacks };
}

// ================================================================ leaving (nodes.md, A host: Her record at a host)
// exportOf(person, held, logId) (the oracle's own builder; the door op is export_whole, below): her record at a host as { format, messages }: every block her door log names, every block she signed that the host holds, each one's pieces, the
// lines each one's answers read, from the block back to the fold's own start and no further (nodes.md, Her record at a host; folds.md, What is left), and the door log. A block another author sealed goes as its header.
// The folds that read a line of a block are asked of every block in it (the ownership of an instance, a first promise's stage and its pot), and the blocks their lines run through go with it.
const logIdOf = b => (b.refs.key !== undefined ? b.refs.key : b.refs.author);
// DECIDED (03-amounts, What building changed): [S3-33] "each answer a fold gives of a block in it" (nodes.md): the folds asked of every block in the document are the ownership of an instance and, of a first promise, its stage and its pot; the
// blocks their lines run through (each from the block back to the fold's own start) go in the export. Stages 4 to 6 add the folds they name.
function foldsRead(pool, ofBlocks) {
  const walked = new Set();
  WALKED = walked; pool.forget();
  try {
    for (const b of ofBlocks) {
      if (b.type === undefined) continue;
      if (isInstance(b)) ownershipFold(b, pool);
      if (b.type === 'promise' && b.refs.answers === undefined && b.refs.updates === undefined) { promiseStage(b, pool); potFold(b, pool, ''); }
    }
  } finally { WALKED = null; pool.forget(); }
  return walked;
}
function exportOf(person, heldIn, logId) {
  const pool = poolOf(heldIn), want = new Map();
  const add = b => { if (b && !want.has(b.hash)) want.set(b.hash, b); };
  const onLog = pool.all().filter(b => b.type !== undefined && logIdOf(b) === logId);
  for (const b of onLog) { add(b); for (const h of asList(b.refs.derives_from)) add(pool.get(h)); }
  for (const b of pool.all()) if (b.refs && b.refs.author === person) add(b);
  const idx = buildIdx(pool.all());
  for (const b of [...want.values()]) for (const h of piecesOf(b, idx).have) add(pool.get(h));
  for (const h of foldsRead(pool, [...want.values()])) add(pool.get(h));
  for (const b of [...want.values()]) for (const h of piecesOf(b, idx).have) add(pool.get(h));
  const messages = [...want.values()].sort(byHash).map(b => (b.type !== undefined ? wrap(b) : { header: header(b), header_signature: b.header_signature }));
  return { format: 'application/foodblock+json', messages };
}
// export_whole(doc, log, last): whether an export is whole (nodes.md, A host, Her record at a host; protocol.json door.ops.export_whole), as { whole, lacks }. The receipts come
// opened. lacks, each once, ids ascending then { author, key, seq } by author, key (null first), seq: what the door log lacks from `last` back to the block that brought its key
// in; each block a receipt on the log names that is not in it, unless a dropped on the log names it or its receipt; each piece of a block in it that is not in it; each block
// a receipt names that is not in it and that the line of a block in it lacks, read back to where the line begins.
function foldLacks(pool) {
  const out = [];
  pool.forget();
  for (const b of pool.all()) {
    if (b.type === undefined) continue;
    const rs = [];
    if (isInstance(b)) rs.push(ownershipFold(b, pool));
    if (b.type === 'promise' && b.refs.answers === undefined && b.refs.updates === undefined) { rs.push(promiseStage(b, pool)); rs.push(potFold(b, pool, '')); }
    for (const r of rs) if (r && r.not_shown) out.push(...r.lacks);
  }
  return out;
}
function exportWhole(doc, logId, last) {
  if (!isObj(doc) || !Array.isArray(doc.messages) || !isStr(logId) || !isStr(last)) throw argError('export_whole takes { format, messages }, a log id and the receipt she holds');
  const raw = doc.messages.filter(m => isObj(m) && isObj(m.block)).map(m => ({ ...blockOnly(m.block), signature: m.signature }));
  const entries = normEntries([...raw.map(b => ({ ...b, hash: idOf(b, raw) })), ...doc.messages.filter(m => isObj(m) && isObj(m.header) && m.block === undefined)]);
  const all = new Map(entries.map(e => [e.hash, e])), pool = new Pool(entries), lacks = [];
  const onLog = e => e.type !== undefined && (keyRefOf(e) !== undefined ? keyRefOf(e) : e.refs.author) === logId;
  const kind = (e, k) => e.type === 'observe' && isObj(e.state) && e.state.kind === k;
  const lastE = all.get(last);
  if (!lastE) lacks.push(last);
  else {
    if (!onLog(lastE)) throw argError('the block she holds is a block on the log');
    const r = walkLine(pool, last, logId);
    if (!r.reached && !r.lacks.length) throw argError('the block she holds is not on the log\'s line');
    lacks.push(...r.lacks);
  }
  const onLogAll = [...all.values()].filter(onLog);
  const receipts = onLogAll.filter(e => kind(e, 'receipt')), drops = onLogAll.filter(e => kind(e, 'dropped'));
  const dropped = new Set(drops.flatMap(d => asList(d.refs.derives_from)));
  const named = new Set(receipts.flatMap(r => asList(r.refs.derives_from)));
  for (const r of receipts) for (const h of asList(r.refs.derives_from)) if (!all.has(h) && !dropped.has(h) && !dropped.has(r.hash)) lacks.push(h);
  for (const e of all.values()) for (const p of [e.refs && e.refs.author, keyRefOf(e)]) if (isStr(p) && !all.has(p)) lacks.push(p);
  // each fold asked of a block in it: its line, from that block back to the fold's own start and no further (nodes.md, Her record at a host): an answer it cannot give for want of a block a receipt names
  for (const x of foldLacks(pool)) if (isStr(x) && named.has(x) && !all.has(x)) lacks.push(x);
  const ids = [...new Set(lacks.filter(isStr))].sort();
  const seen = new Set(), nums = lacks.filter(x => !isStr(x)).filter(x => { const k = jcs(x); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => cmp(a.author, b.author) || (a.key === b.key ? 0 : a.key === null ? -1 : b.key === null ? 1 : cmp(a.key, b.key)) || a.seq - b.seq);
  return { whole: ids.length + nums.length === 0, lacks: [...ids, ...nums] };
}

// ================================================================ 1.9 stage 7: rule sets, a wrapped copy, a kept copy, a receipt, mounts (changes-1.9/07-last.md)
// ---- rule sets by hash (core.md, section 11): the SHA-256 of the canonical bytes of the manifest { files: { path: SHA-256 of the file's bytes } }. A library tool: the name is a fact anyone computes.
function ruleSet(files) {
  if (!isObj(files)) throw argError('files is { <path under spec/>: <the file\'s bytes as text> }');
  const out = {};
  for (const path of Object.keys(files).sort(byBytes)) {
    if (!isStr(files[path]) && !Buffer.isBuffer(files[path])) throw argError('the bytes of ' + path + ' are text');
    out[path] = sha256(Buffer.isBuffer(files[path]) ? files[path] : Buffer.from(files[path], 'utf8'));
  }
  const manifest = { files: out };
  return { id: sha256(Buffer.from(jcs(manifest), 'utf8')), manifest };
}
// the id of the rule set this build is made from: the id of the manifest published beside the spec (`spec/rule-set.json`), or null where the build was given none
function buildRuleSet() {
  try { const m = JSON.parse(require('fs').readFileSync(SPEC + 'rule-set.json', 'utf8')); return isObj(m) && isObj(m.files) ? sha256(Buffer.from(jcs(m), 'utf8')) : null; } catch { return null; }
}
// ---- a wrapped copy (privacy.md, Keeping apart): a copy wrapped in an envelope of its own to a key the reader gave the sender, a mailbox. 1.9-GUESS [7-1]: { mailbox, envelope }, the envelope being the sealed
// plaintext { copy, pad } padded to the sizes of Sealed messages; the mailbox is the key's public encryption key, as the reader gave it. A host that keeps it learns { mailbox, bytes } (and when, by its own clock).
function wrapCopy(copy, mailboxPub, suite) {
  if (!isObj(copy) || !isStr(mailboxPub)) throw argError('a wrapped copy is a sealed copy and a mailbox key');
  return { mailbox: mailboxPub, envelope: seal({ copy }, [mailboxPub], suite, { pad: true }) };
}
function unwrapCopy(w, mailboxPriv) {
  if (!isObj(w) || !isObj(w.envelope) || !isStr(w.mailbox) || Object.keys(w).some(k => k !== 'mailbox' && k !== 'envelope')) throw cryptoError('a wrapped copy is exactly { mailbox, envelope }', 'shape');
  const plain = open(w.envelope, mailboxPriv);
  if (!isObj(plain) || !isObj(plain.copy) || ('pad' in plain && !(isStr(plain.pad) && /^ *$/.test(plain.pad)))) throw cryptoError('a wrapped copy holds a sealed copy and spaces', 'shape');
  return plain.copy;
}
// what a host holds of a wrapped copy: which mailbox, how big after padding (the envelope's ciphertext bytes, tag included), and when it came
const wrappedSeen = w => ({ mailbox: w.mailbox, bytes: Buffer.from(w.envelope.ciphertext, 'base64').length }); // the host's clock is its own: no `at` (stage 7 compare)
// ---- a receipt to a pusher (nodes.md, Push): it names only what that pusher's push added. `taken` is the list of ids one push added; a door log's receipt is an observe of kind `receipt` naming them in `derives_from`
const receiptFor = taken => ({ type: 'observe', state: { kind: 'receipt' }, refs: { derives_from: [...new Set(asList(taken))].sort() } });
// ---- a mount (core.md, section 12): a caller's handle on the door's memory. 32 lowercase hex characters naming, for this door only, the set of blocks given so far; nothing is ever taken out of it; it means nothing and
// is no part of any answer. An op that takes `held` takes a mount in its place and answers as it does for the mount's set given as an array.
const MOUNTS = new Map(), GONE = new Set();
const isMountId = x => isStr(x) && /^[0-9a-f]{32}$/.test(x);
function mountOp(blocks, into) {
  if (!Array.isArray(blocks)) throw argError('blocks is a list');
  let id = into, set;
  if (into !== undefined && into !== null) { if (!MOUNTS.has(into)) throw argError('unknown_mount'); set = MOUNTS.get(into); } else { do { id = crypto.randomBytes(16).toString('hex'); } while (MOUNTS.has(id) || GONE.has(id)); set = new Map(); MOUNTS.set(id, set); }
  for (const b of blocks) set.set(isObj(b) && isStr(b.hash) ? b.hash : isObj(b) && isObj(b.header) ? 'h:' + b.header.hash + ':' + jcs(b) : 'x:' + jcs(b), b);
  return id;
}
// an argument that is a mount is the mount's set; a mount forgotten is an argument error. A 32-hex text that never was a mount is read as it is.
function mountArgs(a) {
  return a.map(x => { if (!isMountId(x)) return x; if (MOUNTS.has(x)) return [...MOUNTS.get(x).values()]; if (GONE.has(x)) throw argError('unknown_mount'); return x; });
}
function publicKeyOf(priv, suite) {
  if (!isStr(priv)) throw argError('private_key is hex');
  if (suiteOf(suite) === 'std' && priv.length !== 64) return crypto.createPublicKey(crypto.createPrivateKey({ key: Buffer.from(priv, 'hex'), format: 'der', type: 'pkcs8' })).export({ format: 'der', type: 'spki' }).toString('hex');
  return keypair(priv, suite).public_key_sign;
}

// ================================================================ the door: one case per rule
// every argument is JSON as I-JSON writes it: a string holding a lone surrogate is no text, and an argument error (conventions.json door.conventions.text)
const notText = v => (typeof v === 'string' ? lonePair(v) : Array.isArray(v) ? v.some(notText) : isObj(v) ? Object.entries(v).some(([k, x]) => lonePair(k) || notText(x)) : false);
// 1.9 3a-12: no answer depends on the machine. A fold's limits on depth and work are its reader's own; where it stops it answers `not_shown`, with why, and never names an owner. The oracle walks as far as
// Node's stack lets it; where the stack ends it stops. 1.9 3a (decided, CORE-SET "What building changed"): the reason is one entry in `lacks`: { stopped: 'depth' }.
// encoding.md, Limits: a reader reads nothing nested deeper than limits.read_depth, not even a door's arguments (end pass 2026-11-20, as the core's door reads them)
const argsDepth = (x, d = 0) => (d > READ_DEPTH + 1 ? d : Array.isArray(x) ? Math.max(d + 1, ...x.map(y => argsDepth(y, d + 1))) : isObj(x) ? Math.max(d + 1, ...Object.values(x).map(y => argsDepth(y, d + 1))) : d);
function door(op, ...a) {
  if (argsDepth(a) > READ_DEPTH) { const e = new Error('args: nested deeper than ' + READ_DEPTH); e.kind = 'json'; throw e; }
  try { return doorNow(op, ...a); } catch (e) {
    if (e instanceof WalkStopped && ['ownership', 'ownership_view', 'made_from', 'pot', 'promise_stage', 'promise_view', 'where_now', 'read_whole'].includes(op)) return { not_shown: true, lacks: [e.block, { stopped: 'depth' }] };
    if (e instanceof RangeError && /call stack|too much recursion/i.test(String(e.message)) && ['ownership', 'ownership_view', 'made_from', 'pot', 'promise_stage', 'promise_view', 'where_now', 'read_whole'].includes(op)) return op === 'made_from' ? { not_shown: true, lacks: [{ stopped: 'depth' }] } : { not_shown: true, lacks: [{ stopped: 'depth' }] };
    throw e;
  }
}
function doorNow(op, ...a0) {
  if (op === 'mount') return mountOp(a0[0], a0[1]);
  if (op === 'unmount') { if (!isMountId(a0[0]) || !MOUNTS.has(a0[0])) throw argError('unknown_mount'); MOUNTS.delete(a0[0]); GONE.add(a0[0]); return true; }
  const a = mountArgs(a0);
  if (a.some(notText)) throw argError('an argument holds a string that is not well-formed text');
  // a list argument (written [...] in the op's args in protocol.json) given as anything but a list, or null, is an argument error: never read as the empty list
  ((P.door.ops[op] || C.door.ops[op] || {}).args || []).forEach((spec, i) => {
    if (/^[a-z_]+\??: \[/.test(spec) && a[i] !== undefined && a[i] !== null && !Array.isArray(a[i])) throw argError('argument ' + i + ' is a list');
  });
  switch (op) {
    case 'check_chain': return chainFold(a[0], a[1]);
    case 'fork_pairs': return forkPairs(a[0]);
    // whether a block is its author's word: read in its input with it held (a block no node would take on what it rests on is no one's word)
    case 'signed_by_author': {
      const b = a[0], pool = readWith(a[1], b);
      if (!pool.get(b.hash)) return false;
      if (!isStr(b.refs && b.refs.author)) return soundGenesis(pool.get(b.hash));
      return identityFold(b.refs.author, pool).signed_by_author[b.hash] === true;
    }
    case 'header': return header(a[0]);
    // the opened block in one shape with the core's (end pass 2026-11-20): { hash, type, state, refs, signature, reveals }
    case 'open_copy': { const m = openCopy(a[0], a[1]); const b = blockOnly(m.block); return { hash: m.hash, type: b.type, state: b.state, refs: b.refs, signature: m.signature, ...(m.reveals !== undefined ? { reveals: m.reveals } : {}) }; }
    // the ids a block names for its meaning, ascending; with `held`, those not held (a block held by its header alone is held)
    case 'needs': { if (a[1] === undefined || a[1] === null) return needsOf(a[0]); const have = new Set(normEntries(heldList(a[1])).map(e => e.hash)); return needsOf(a[0]).filter(h => !have.has(h)); }
    // 1.9 3a-3 (stage 5 compare): what a writer refuses to sign, asked of an unsigned draft { type, state, refs }, read against held
    case 'write_refusals': { if (!isObj(a[0]) || !isStr(a[0].type)) throw argError('argument 0 is a draft: { type, state, refs }'); return writeFindings({ type: a[0].type, state: a[0].state || {}, refs: a[0].refs || {} }, a[1] || []); }
    case 'read': return readFindings(a[0], a[1], a[2], a[3]);
    case 'read_whole': return readWhole(a[0], a[1], a[2]);
    case 'log_shown': return logShown(a[0], a[1], a[2], a[3]);
    case 'export_whole': return exportWhole(a[0], a[1], a[2]);
    // the core's own convenience (sdk/door.table): a signed push checked against the keys given
    case 'push_refusals': return pushRefusals(a[0], a[1]);
    // 1.9 stage 7 (A2): the third argument may carry the node's admission rule for sealed copies (`copies`), the fifth names the push (`{ signer?, for? }`); with either, the answer adds `copies` and `wrapped`
    case 'accept': { const keep = (isObj(a[2]) && a[2].copies !== undefined) || (a[4] !== undefined && a[4] !== null) ? { rule: isObj(a[2]) ? a[2].copies : undefined, push: a[4] } : undefined; const r = accept(a[0], a[1], pairChoice(a[2], 'takes_pairs'), Array.isArray(a[3]) ? a[3] : undefined, keep); return { ...r, taken: r.taken.map(b => b.hash), unread: r.unread }; }
    case 'past_of': return pastOfBlock(a[0], a[1]);
    case 'sees': return pastOfBlock(a[0], a[2]).includes(a[1].hash);
    case 'row_holds': return rowHoldsOp(a[0], a[1]); // 1.9 stage 6 (06-circles.md section 6): `may_act_as` is removed; row_holds(block, held), the circle read from refs.as
    case 'ways_in': return waysIn(a[0], a[1]);
    case 'speaks_for': return speaksFor(a[0], a[1]);
    case 'account_of': return accountOf(a[0], a[1]);
    case 'backed': return backed(a[0], a[1], a[2]);
    case 'backed_all': return backedAll(a[0], a[1]);
    case 'to_come_back': return toComeBack(a[0], a[1]); // 1.9-GUESS [3c-7]: the answer's list is named `to_come` as well, not `owed`; // 1.9 3c-7 (D12): `owed_back` becomes `to_come_back`
    case 'gives': return gives(a[0], a[1], a[2]);
    // 1.9 stage 6 (O1): whether a draft { type, state, refs }, signed, would bind anyone: an accept, or a draft whose `gives` of the one whose word it is (refs.as where it is
    // signed as a circle, else refs.author) is not empty. One rule.
    case 'binds': {
      const d = a[0];
      if (!isObj(d)) throw argError('argument 0 is a draft { type, state, refs }');
      // a circle's founding block that states its parts binds its founder: it puts every part in her hand, and is her start for them
      // (06-circles C1; the owner's decision, 2026-11-20)
      if (isObj(d.state) && isObj(d.refs) && isStr(d.refs.author) && isFoundingCircle(d) && packOf(d)) return true;
      const asCircle = isObj(d.refs) && d.refs.as !== undefined && isStr(d.refs.author);
      if (isObj(d.state) && d.state.status === 'accepted' && !asCircle) return true;
      const refs = isObj(d.refs) ? d.refs : {}, who = isStr(refs.as) && refs.as !== '' ? refs.as : refs.author;
      if (!isStr(who)) return false;
      let draft = { type: d.type, state: isObj(d.state) ? d.state : {}, refs };
      // 1.9 stage 7 (owner decision 2): a draft signed `as` a circle answers as if her hand counts: it is read as a block of her own, in the pool, and binds where her row would hold for it (or every owner signs it)
      if (refs.as !== undefined && isStr(refs.author)) {
        // her hand is the next block on her own line: a draft that states no `seq` and `prev` is placed after the last block of the key it names (else of her first key) that is held
        const held = poolOf(a[1] || []).all();
        if (draft.state.seq === undefined && refs.prev === undefined) {
          const line = held.filter(x => x.refs && x.refs.author === refs.author && x.refs.key === refs.key && Number.isInteger(x.state.seq));
          const head = line.sort((x, y) => y.state.seq - x.state.seq)[0];
          const link = nextLink(head, refs.author);
          draft.state = { ...draft.state, seq: link.seq }; draft.refs = { ...refs, prev: link.prev };
        }
        const pool = new Pool(held), hash = hashOfBlock(draft, 'std');
        if (!pool.get(hash)) pool.m.set(hash, { hash, ...draft });
        pool._assumed = new Set([hash]); // 1.9 stage 7: the draft is read as her signed form would be
        pool.forget();
        if (!isFoundingCircle(pool.get(refs.as)) || !circleHolds(pool.get(hash), pool).holds) return false;
        if (draft.state.status === 'accepted') return true;
        return givesIn({ hash, ...draft }, who, pool, a[1] || []).gives.length > 0;
      }
      return gives(draft, who, a[1] || []).gives.length > 0;
    }
    case 'listing_check': return listingCheck(a[0], a[1], a[2]);
    case 'check_reads': return checkReads(a[0], a[1]);
    case 'clearing_applied': return clearingApplied(a[0], a[1]);
    case 'ruling_audience': return rulingAudience(a[0], a[1], a[2] === undefined || a[2] === null ? null : a[2]);
    case 'fee_back': return feeBack(a[0], a[1], a[2]);
    // a threshold read against that many voices (folds.md, Counts); null when it names no count
    case 'count_of': {
      const n = a[0], m = a[1];
      if (!Number.isInteger(m) || m < 0) throw argError('members is a whole number');
      if (m === 0) return null;
      return Number.isInteger(n) && n >= 1 && n <= m ? n : null;
    }
    case 'ruling_releases': return rulingReleases(a[0], a[1], a[2] === undefined || a[2] === null ? null : a[2]);
    case 'circle_state': return circleState(a[0], a[1], a[2]);
    case 'circle_versions': return circleVersions(a[0], a[1]);
    case 'circle_key': return circleKey(a[0], a[1]); // profiles/rekeys.md
    case 'members_then': return membersThen(a[0], a[1], a[2]);
    // 1.9 stage 4 (G1): runs `read` first; one rule for a tool's word; a pair on the line gives the fork answer, not false
    case 'why_not_under': { const b = a[0], pool = readWith(a[1], b); if (!pool.get(b.hash)) return [{ code: 'not_live', detail: 'the block is no word: it is not valid on what it rests on, or rests on a block not held' }]; return whyNotUnder(b, pool).map(x => ({ code: x.code, detail: x.detail, ...(x.why ? { why: x.why } : {}), ...(x.pair ? { pair: x.pair } : {}), ...(x.lacks ? { lacks: x.lacks } : {}), ...(x.waiting ? { waiting: x.waiting } : {}) })); }
    case 'under_ok': { const b = a[0], pool = readWith(a[1], b); if (!pool.get(b.hash)) return false; const w = whyNotUnder(b, pool); return w.length === 0 ? true : w[0].code === 'pair' ? w[0].pair : false; }
    case 'keeps_to': return keepsToOp(a[0], a[1], a[2]);
    case 'meter': return meterOp(a[0], a[1], a[2]);
    case 'worst_case': return worstOp(a[0], a[1]);
    case 'lowest_offer': return lowestOp(a[0], a[1]);
    // a fold asked about a block that is not read gives no answer (folds.md, A fold reads only what is valid and read)
    case 'ownership': { const p = withThing(a[0], a[1]); return p.get(a[0].hash) && isReadIn(a[0], a[1]) ? ownershipFold(a[0], p, undefined, '') : null; } // 1.9 3c-6: `ownership` and `pot` take no clock
    case 'ownership_view': { const p = new Pool([a[0], ...poolOf(a[1]).all()]); return p.get(a[0].hash) ? ownershipFold(a[0], p, undefined, '') : null; }
    case 'made_from': { const p = withThing(a[0], a[1]); return p.get(a[0].hash) && isReadIn(a[0], a[1]) ? madeFromList(a[0], p) : null; }
    case 'where_now': { const p = withThing(a[0], a[1]); return p.get(a[0].hash) ? whereNow(a[0], p) : []; }
    case 'shares_on': return sharesOn(a[0], a[1]);
    case 'use_shown': return useShown(a[0], a[1], a[2]);
    case 'not_free_shown': return notFreeShown(a[0], a[1]);
    case 'invasion_shown': return invasionShown(a[0], a[1]);
    case 'release_shown': return releaseShown(a[0], a[1]);
    case 'pot': return isObj(a[0]) && !isReadIn(a[0], a[1]) ? null : potFold(a[0], a[1], ''); // a head that is not read gives no answer (row 106)
    case 'spec': return { protocol: P, conventions: C, rule_set: buildRuleSet() };
    case 'rule_set': return ruleSet(a[0]);
    case 'public_key_of': return publicKeyOf(a[0], a[1]);
    case 'push_answer': return buildPushAnswer(a[0], a[1], a[2], a[3]);
    case 'matches': return matches(a[0], a[1], a[2]);
    case 'answer_pull': {
      const c = a[4];
      if (!isObj(c) || !Number.isInteger(c.cap) || c.cap < 1) throw argError('choices.cap is a whole number of at least 1: the node states it');
      return answerPull(a[0], a[1], a[2], a[3], { cap: c.cap, serves_pairs: pairChoice(c, 'serves_pairs') }, a[5], a[6], a[7], a[8] === null ? undefined : a[8]);
    }
    case 'keypair': return keypair(a[0], a[1]);
    // 1.9 3a-3: a writer signs only what its own `read` reads
    // the refusal's kind is the one the core's door gives (end pass 2026-11-20)
    case 'sign': { if (isObj(a[0]) && a[0].type !== undefined) { const f = writeFindings(a[0]); if (f.length) throw cryptoError('sign refuses a block its own read refuses: ' + f.map(x => x.code).join(', ')); } return signBlock(a[0], a[1], a[2]); }
    case 'verify': return verifyBlock(a[0], a[1], a[2]);
    case 'hash': return hashOfBlock({ type: a[0], state: a[1], refs: a[2] }, a[3]);
    case 'valid': return valid(a[0], a[1]);
    case 'base_fields': return baseFields(a[0]);
    case 'merkle_root': return merkleRoot(a[0]);
    case 'merkle_proof': return merkleProof(a[0], a[1]);
    case 'merkle_verify': return merkleVerify(a[0], a[1], a[2], a[3]);
    // 1.9 R-C1 (stage 5): read on the blocks in the causal past of the block it is read for (a block, or the id of one held), or on every block held (null);
    // never on a reader's clock. R-C3: the core runs no named reading (protocol.json `named_readings`): a condition that names one, bare or wrapped, is not read (null)
    case 'condition_holds': {
      const named = c => isObj(c) && ('without' in c || 'within' in c ? named('without' in c ? c.without : c.within) : (P.named_readings || []).some(k => k in c));
      const held = poolOf(a[1]).all();
      // the arguments are read before the condition (end pass 2026-11-20, as the core does): a block it is read for that is not held is an argument error
      const at = a[2] === undefined || a[2] === null ? null : isStr(a[2]) ? held.find(b => b.hash === a[2]) : isObj(a[2]) ? a[2] : undefined;
      if (at === undefined) throw argError('the block it is read for is a block, an id held, or null');
      if (named(a[0])) return null;
      if (at === null) return conditionHolds(a[0], held);
      const pool = new Pool([at, ...held.filter(b => b.hash !== at.hash)]), past = pool.past(at.hash);
      return conditionHolds(a[0], held.filter(b => past.has(b.hash)));
    }
    case 'terms_total': return pureJunk.terms(a[0], a[1]) ? null : termsTotal(a[0], a[1]);
    case 'add_duration': { if (!(a[2] === undefined || a[2] === null || Number.isInteger(a[2]))) throw argError('the sign is a whole number'); return addDur(a[0], a[1], a[2] === undefined || a[2] === null ? 1 : a[2]); }
    // a pull asks from `since` (0 when it names none); anything but an object is a pull of everything from the start (nodes.md, Pull)
    case 'pull_request': { const r = isObj(a[0]) ? { ...a[0] } : {}; if (r.since === undefined) r.since = 0; return Object.fromEntries(C.messages.pull.filter(k => k in r).map(k => [k, r[k]])); }
    // a block has waited too long when the node's own time since it arrived passes the node's ttl, in whole milliseconds
    case 'waited_too_long': { if (!Number.isInteger(a[2])) throw argError('the time to wait is a whole number of milliseconds'); const s0 = Date.parse(a[0]), n0 = Date.parse(a[1]); return Number.isFinite(s0) && Number.isFinite(n0) && n0 - s0 > a[2]; }
    case 'key_hash': return keyHash(a[0], a[1]);
    case 'salted_hash': return saltedHash(a[0], a[1], a[2]);
    case 'wrap': return wrap(a[0]);
    case 'unwrap': return unwrap(a[0], Array.isArray(a[1]) ? a[1] : undefined);
    case 'id_of': return idOf(a[0], Array.isArray(a[1]) ? a[1] : undefined);
    case 'seal': if (isObj(a[3]) && a[3].vectorsOnly !== true && !(Object.keys(a[3]).length === 1 && a[3].pad === true)) throw argError('fixed randomness only reproduces a vector: say so with vectorsOnly: true'); return seal(a[0], a[1], a[2], a[3]);
    case 'open': return open(a[0], a[1]);
    case 'cbor_encode': return cborEncode(a[0], a[1]).toString('hex');
    case 'cbor_decode': return cborDecode(a[0], Array.isArray(a[1]) ? a[1] : undefined);
    case 'verify_message': return verifyMessage(a[0], a[1]);
    case 'passkey_challenge': return passkeyChallengeOf(a[0]);
    case 'passkey_signature': return passkeySignature(a[0], a[1], a[2]);
    case 'suite_of_key': return suiteOfKey(a[0]);
    case 'key_timeline': return identityFold(a[0], a[1]).timeline;
    case 'strict_text': return strictText(a[0]);
    case 'strict_push': return strictPush(a[0]);
    case 'next_link': return nextLink(a[0], a[1]);
    case 'due': return due(a[0], arrivalsArg(a[1]));
    case 'promise_view': return promiseView(a[0], a[1], { ...(a[2] || {}), now: clock(a[2] && a[2].now) });
    // many deals of one store, each read as promise_view reads it
    case 'promise_views': { const pool = poolOf(a[1]); const now = clock(a[2] && a[2].now); return Object.fromEntries(asList(a[0]).map(h => { const f = pool.get(h); return [h, f ? promiseView(f, pool, { now }) : null]; })); }
    // the keys that may sign a request (nodes.md, Messages): the keys of standing voices and keys under them that no standing key grant has ended
    case 'live_keys': return identityFold(a[0], a[1]).keys;
    case 'identity_state': { const f = identityFold(a[0], a[1]); return { signed_by_author: { ...f.signed_by_author }, voices: f.voices.map(v => (isObj(v) ? { ...v, passes: v.passes === true } : v)), // 1.9 3b-11: per voice, whether it states that what it signs passes
    clocks: f.clocks, keys: f.keys, waiting: f.waiting }; }
    // blocks.md, Finality, read on the blocks held with no clock and no arrival
    // a value that is no block (no refs) stands for nothing and waits on nothing, as the core reads it (end pass 2026-11-20)
    case 'stands': { const b = a[0]; if (!isObj(b) || !isObj(b.refs) || !isObj(b.state)) return { stands: false, waiting: [] }; const pool = readWith(a[1], b); return standsOf(pool.get(b.hash) || b, pool); }
    case 'short_reply': return shortReplyText(a[0]);
    case 'short_reply_open': return shortReplyOpen(a[0], a[1], a[2]);
    // the first promise is a full block (protocol.json, door.promise_stage): an id in its place names no block, and the answer is null, as the core's
    case 'promise_stage': return isObj(a[0]) ? promiseStage(a[0], a[1], a[2]) : null;
    case 'consent': return consentFold(a[0], a[1], a[2], isObj(a[3]) ? a[3] : null);
    case 'admission_refusals':
      if (a.length < 4 || !(a[3] === null || isObj(a[3]))) throw argError('admission is the rule\'s state object or an explicit null (no rule): the node states it');
      if (!Number.isInteger(a[4])) throw argError('asks_today is a whole number: the node states it');
      return admissionRefusals(a[0], a[1], a[2], a[3], a[4]);
    case 'is_stranger':
      if (!isStr(a[0]) || !isStr(a[1])) throw argError('receiver and sender are ids (text)');
      return isStranger(a[0], a[1], a[2], isObj(a[3]) ? a[3] : null);
    case 'repeat_occurrences': return repeatOccurrences(a[0], a[1], a[2]);
    case 'schemas_from': return schemasFrom(a[0]);
    case 'scope_reading': return scopeReading(a[0]);
    case 'fence_reading':
      if (timeProblem(a[1]) !== null) throw argError('at is a time');
      if (a[3] !== undefined && a[3] !== null && timeProblem(a[3]) !== null) throw argError('heard is a time or null');
      return fenceReading(a[0], a[1], a[2], a[3]);
    case 'machine_lock': return machineLock(a[0], a[1], clock(a[2], false));
    case 'short_code': return shortCode(a[0]);
    case 'code_matches': return codeMatches(a[0], a[1]);
    case 'residency_refusals': return residencyRefusals(a[0], a[1]);
    case 'reading_is_persons_claim': return readingIsPersonsClaim(a[0], a[1], a[2]);
    // 1.9 R-C1 (stage 5): read on the readings in the causal past of the block it is read for (a block, or the id of one held), the window ending at
    // that block's own `at` (its signer's word, read against her); a block that states no `at` holds nothing. Never a reader's clock.
    case 'reading_condition_holds': {
      const held = poolOf(a[1]).all();
      const at = isStr(a[2]) ? held.find(b => b.hash === a[2]) : isObj(a[2]) ? a[2] : undefined;
      if (!at) throw argError('argument 2 is the block it is read for');
      const pool = new Pool([at, ...held.filter(b => b.hash !== at.hash)]), past = pool.past(at.hash);
      if (!isStr(at.state && at.state.at)) return false;
      return readingConditionHolds(a[0], held.filter(b => past.has(b.hash)), at.state.at);
    }
    // 1.9 stage 7 (Job C), readings (door.classes.reading): the read-back, its words and a second reader's redo (spec/readings/readback, spec/renderers/; library readback/)
    case 'readback': return require('./readback/redo.cjs').make(a[0], a[1], a[2], a[3], a[4]);
    case 'render': return require('./readback/redo.cjs').render(a[0], a[1]);
    case 'readback_redo': return require('./readback/redo.cjs').redo(a[0], a[1]);
    default: throw new Error('the oracle has no op ' + op);
  }
}

// ================================================================ exports
module.exports = {
  P, C, door, jcs, canonical, canonOf, hashBytes, hashStr, hashOfBlock, saltedHash, keyHash, shortCode, standsOf, shortReplyText, shortReplyOpen, keypair, signBlock, verifyBlock, verifyBytes, signBytes,
  setReadLimit, ruleSet, buildRuleSet, wrapCopy, unwrapCopy, receiptFor, wrappedSeen, mountOp, seal, padPlain, padSize, open, suiteOfKey, encPublicOf, strictText, strictPush, contentFindings, writeFindings, readFindings, readWhole, walkLine, logShown, buildPushAnswer, onLine, exportOf, exportWhole, headerEntry, normHeld, Pool, identityFold, addDur, valid, validStages,
  cborEncode, cborDecode, cborHeader, cborHeaderDecode, cborEncodePush, cborDecodePush, chainFold, forkPairs, nextLink, header, matches, accept,
  whyNotUnder, circleFold, circleState, rowHoldsOp, waysIn, circleVersions, membersThen, circleKey, countedIn, promiseStage, promiseView, due, ownershipFold, whereNow, drawsOn, madeFromList, holderOf, reachOfWord, potFold, termsTotal, fText,
  consentFold, isStranger, speaksFor, backed, backedAll, toComeBack, listingCheck, checkReads, clearingApplied, rulingReleases, rulingAudience, gives, accountOf, scopeReading, admissionRefusals, residencyRefusals, readingIsPersonsClaim, signMessage, verifyMessage, pullRefusals, pushRefusals,
  answerSignedBy, pushAnswer, pushRequest, wellKnownErrors, wellKnown, announcement, openCopy, headerSignedBy, wrap, unwrap, counts, grantLive,
};
// the envelope's parts, for tools/vectors.cjs alone: it opens a sealed copy in the vectors and seals its new plaintext under the same content key
module.exports.envelopeParts = { agree, envKey, gcmSeal, gcmOpen, suiteOfAlg };
