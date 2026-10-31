'use strict';
// FoodBlock 1.7 conformance oracle, written from the spec TEXT only (core.md, canonical.md, protocol.md, transport.md,
// protocol.json, modules/*.md, profiles/*.md, legacy/converter.md). Plain Node, built-in crypto, no dependency.
// Where the text is silent a reading is marked GUESS. Where a primitive is not in Node (SM2, SM4-GCM) it is built by hand.
const crypto = require('crypto');
const SUITES = ['std', 'p256', 'sm'];
const SPEC = require('path').join(__dirname, '..') + '/';
const P = require(SPEC + 'protocol.json');
const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const isStr = x => typeof x === 'string';
const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
const byHash = (a, b) => cmp(a.hash, b.hash);
// a time as milliseconds, or null when it is no time; a block's own date; a grant's scope.until
const timeMs = s => (isStr(s) && !isNaN(Date.parse(s)) ? Date.parse(s) : null);
const termsOf = b => (isObj(b.state.terms) ? b.state.terms : {}); // a promise's terms, read as an object
const atMs = b => timeMs(b.state && b.state.at);
const untilMs = g => (isObj(g.state.scope) ? timeMs(g.state.scope.until) : null);
// ranOut(grant, block): the grant's scope.until has come by the block's own date (decision H11), a cut there. Silence may only narrow, never widen: a
// block with no date is cut too. (An act under a grant, decision D14, is the other reading: grantLive keeps a dateless act.)
const ranOut = (grant, block) => { const u = untilMs(grant); return u !== null && (atMs(block) === null || u <= atMs(block)); };
// whether a block is dated at or after `since` (null: any block); a block with no date is not
const datedFrom = (b, since) => since === null || (atMs(b) !== null && atMs(b) >= since);
// the fields that hold each shape (protocol.json field_shape): time, date, duration, or exactly one keyed shape
const fieldsOf = shape => Object.keys(P.field_shape).filter(k => P.field_shape[k] === shape);
const TIME_FIELDS = fieldsOf('time'), DATE_FIELDS = fieldsOf('date'), DURATION_FIELDS = fieldsOf('duration'), BARE_FIELDS = fieldsOf('shape');

// ================================================================ canonical form (canonical.md)
// RFC 8785 (JCS). Writing never sorts sets or drops anything: strict writing is a CHECK (below), not a repair.
function jcs(v) {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Object.is(v, -0) ? '0' : String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(jcs).join(',') + ']';
  if (typeof v === 'object') return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + jcs(v[k])).join(',') + '}';
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
// recovery_key_hash (encoding.md): the identity's suite hash of the recovery key's SPKI hex as UTF-8.
const recoveryKeyHash = (spkiHex, suite) => hashStr(suite || 'std', spkiHex);
// Receipt code (short-form.md): first 5 bytes of the id, Crockford Base32, XXXX-XXXX. A prefixed id uses the hash bytes. The long form is the first 50 bits, XXXXX-XXXXX.
function receiptCode(id, long) {
  const hex = id.replace(/^[a-z0-9-]+:/, '');
  const chars = long ? 10 : 8;
  let n = BigInt('0x' + hex.slice(0, 14));
  const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  let s = '';
  for (let i = 0; i < chars; i++) s += A[Number((n >> BigInt(51 - 5 * i)) & 31n)];
  return s.slice(0, chars / 2) + '-' + s.slice(chars / 2);
}
// A typed code names a block (short-form.md): case-insensitive, spaces and hyphens ignored, O is 0, I and L are 1; 8 characters match the short code, 10 the long one.
function codeMatches(text, id) {
  const typed = String(text).replace(/[\s-]/g, '').toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1');
  if (typed.length !== 8 && typed.length !== 10) return false;
  return receiptCode(id, typed.length === 10).replace('-', '') === typed;
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
// Any repeated key, at any depth, in JSON text that already parsed.
function hasRepeatedKey(text) {
  let i = 0;
  const ws = () => { while (' \t\n\r'.includes(text[i])) i++; };
  const str = () => { let j = i + 1; while (text[j] !== '"') { if (text[j] === '\\') j++; j++; } const v = JSON.parse(text.slice(i, j + 1)); i = j + 1; return v; };
  function value() {
    ws();
    if (text[i] === '{') {
      i++; const seen = new Set(); ws();
      if (text[i] === '}') { i++; return false; }
      for (;;) {
        ws(); const k = str(); if (seen.has(k)) return true; seen.add(k); ws(); i++; if (value()) return true; ws();
        if (text[i++] === '}') return false;
      }
    }
    if (text[i] === '[') {
      i++; ws(); if (text[i] === ']') { i++; return false; }
      for (;;) { if (value()) return true; ws(); if (text[i++] === ']') return false; }
    }
    if (text[i] === '"') { str(); return false; }
    while (i < text.length && !',]} \t\n\r'.includes(text[i])) i++;
    return false;
  }
  return value();
}
// sig: r||s (64) | length of authenticatorData (2, big-endian) | authenticatorData | clientDataJSON
function passkeyVerify(bytes, sig, pubSpkiHex) {
  const n = sig.readUInt16BE(64), auth = sig.subarray(66, 66 + n), cdj = sig.subarray(66 + n);
  if (auth.length !== n || n < P.suites.p256.signature.passkey.min_authenticator_data_bytes || cdj.length === 0 || (auth[32] & 1) === 0) return false;
  let text, data;
  // UTF-8 with no byte order mark, JSON (RFC 8259) whose every number is finite, no deeper than limits.depth_read (encoding.md, Passkeys)
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(cdj); data = JSON.parse(text); } catch { return false; }
  const finite = v => (typeof v === 'number' ? Number.isFinite(v) : v !== null && typeof v === 'object' ? Object.values(v).every(finite) : true);
  if (!finite(data) || depthOf(data) > P.limits.depth_read) return false;
  if (data === null || typeof data !== 'object' || Array.isArray(data) || hasRepeatedKey(text)) return false;
  if (data.type !== 'webauthn.get' || data.challenge !== passkeyChallenge(bytes)) return false;
  const signed = Buffer.concat([auth, crypto.createHash('sha256').update(cdj).digest()]);
  if (!lowS(sig.subarray(0, 64))) return false;
  return crypto.verify('sha256', signed, ieeeKey(pubSpkiHex), sig.subarray(0, 64));
}
// The WebAuthn signature may be DER; the passkey signature is r||s.
function derToRs(der) {
  let i = 2; if (der[1] & 0x80) i += der[1] & 0x7f;
  const out = Buffer.alloc(64);
  for (const at of [0, 32]) { const len = der[i + 1]; let v = der.subarray(i + 2, i + 2 + len); while (v.length > 32 && v[0] === 0) v = v.subarray(1); v.copy(out, at + 32 - v.length); i += 2 + len; }
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
  return passkeyChallenge(Buffer.from(isBlock ? canonOf(v) : jcs(rest), 'utf8'));
};
const signBlock = (b, privHex, suite) => signBytes(Buffer.from(canonOf(b), 'utf8'), privHex, suite);
// The key's own suite decides the algorithm (its SPKI prefix names it).
const verifyBlock = (b, sigHex, pubHex) => verifyBytes(Buffer.from(canonOf(b), 'utf8'), sigHex, pubHex);

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
  return Buffer.from(crypto.hkdfSync(kdfHash(s), secret, Buffer.concat([Buffer.from(ephHex, 'hex'), Buffer.from(recipHex, 'hex')]), Buffer.from(P.envelope.hkdf_info, 'utf8'), 32));
}
// seal(plaintext, [recipient encryption keys], suite, fixed?); fixed = { ephemeral (private hex), contentKey, nonce, keyNonces[] } for tests.
function seal(plaintext, recipients, suite, fixed) {
  const s = suiteOf(suite), f = fixed || {};
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
const POWERS = new Set([...P.powers, 'rekey']); // rekey is the power of profiles/rekeys.md
const STATUSES = new Set(P.statuses);
const FIELDS_EVERY = new Set(P.fields.every);
// A type's own base fields, and the key fields (defined once) for an actor and a grant.
const baseFields = type => [...(P.fields[type] || []), ...(P.key_fields.on.includes(type) ? P.key_fields.fields : [])];
const PROFILE_FIELDS = { every: ['proof', 'assisted_by', 'stays_in'], grant: ['witnesses', 'needed', 'wait', 'keys', 'epoch'] };
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

function currencyProblem(c) {
  if (isStr(c)) return RX.currency.test(c) ? null : 'shape';
  if (!isObj(c)) return 'shape';
  const keys = P.shapes.currency_unit;
  if (!keys.every(k => k in c) || Object.keys(c).some(k => !keys.includes(k))) return 'shape';
  if (idProblem(c.issuer) || !isStr(c.unit) || !c.unit) return 'shape';
  if (!Number.isInteger(c.decimals) || c.decimals < 0 || c.decimals > P.limits.decimals_max) return 'shape';
  return null;
}
function moneyProblem(m) {
  if (!isObj(m) || Object.keys(m).some(k => !P.shapes.money.includes(k)) || !Number.isInteger(m.minor) || m.minor < 0) return 'shape'; // money is never below zero
  return currencyProblem(m.currency);
}
const has = (o, ...ks) => ks.every(k => k in o);
// An amount { value, unit }, a price (money, or money per unit { money, per }) and a quantity (an amount, or a range { min, max }
// only under a per-unit price) at the places a promise's terms and lines name them (promises.md, Terms). Each returns a code, or null.
const amountProblem = a => {
  if (a === undefined) return null;
  if (!isObj(a) || Object.keys(a).some(k => !P.shapes.amount.includes(k)) || !isStr(a.value) || !isStr(a.unit) || a.unit === '') return 'shape';
  return RX.decimal.test(a.value) ? null : 'decimal';
};
const perUnit = p => isObj(p) && 'per' in p;
// a price fixed later (promises.md, Terms): { figure, by, signers, deadline, keepers }, and optionally fraction, min, max
const figureKeys = p => isObj(p) && 'figure' in p && P.shapes.price_figure.every(k => k in p) && Object.keys(p).every(k => P.shapes.price_figure.includes(k) || P.shapes.price_figure_optional.includes(k));
function figureProblems(p) {
  const out = [];
  if (!figureKeys(p)) out.push('shape');
  if (!(isStr(p.figure) && p.figure !== '')) out.push('shape');
  if (!(Array.isArray(p.by) && p.by.length && p.by.every(x => isStr(x) && (RX.id.test(x) || RX.role_ref.test(x))))) out.push('shape');
  if (!(Number.isInteger(p.signers) && p.signers >= 1)) out.push('shape');
  const t = timeProblem(p.deadline); if (t) out.push(t);
  if (keepersOf(p.keepers) === null) out.push('shape');
  if ('fraction' in p && !(isStr(p.fraction) && RX.decimal.test(p.fraction) && decCmp(p.fraction, '0') >= 0 && decCmp(p.fraction, '1') <= 0)) out.push('shape');
  for (const k of ['min', 'max']) if (k in p) { const c = moneyProblem(p[k]); if (c) out.push(c); }
  return out;
}
function priceProblems(p) {
  const out = [];
  if (p === undefined) return out;
  if (isObj(p) && 'figure' in p) return figureProblems(p);
  if (isObj(p) && !perUnit(p) && shapeOf(p) === 'amount') { const c = amountProblem(p); return c ? [c] : []; }
  if (perUnit(p)) {
    if (Object.keys(p).some(k => !P.shapes.price_per.includes(k))) out.push('shape');
    if (p.money === undefined) out.push('shape'); else { const c = moneyProblem(p.money); if (c) out.push(c); }
    const c = amountProblem(p.per); if (c) out.push(c);
    return out;
  }
  const c = moneyProblem(p); return c ? [c] : [];
}
function quantityProblems(q, price) {
  const out = [];
  if (q === undefined) return out;
  if (!(isObj(q) && (q.min !== undefined || q.max !== undefined))) { const c = amountProblem(q); return c ? [c] : []; }
  if (!perUnit(price)) out.push('shape');
  if (Object.keys(q).some(k => !P.shapes.range.includes(k))) out.push('shape');
  for (const e of ['min', 'max']) { const c = amountProblem(q[e]); if (c) out.push(c); }
  if (isObj(q.min) && isObj(q.max) && q.min.unit === q.max.unit && decCmp(q.min.value, q.max.value) > 0) out.push('shape');
  return out;
}
// Shapes are read at the places protocol.json gives them (shapes.places), never by a field name deeper in (encoding.md, Shapes). An object whose keys
// are exactly a shape's is that shape, and is checked as one, in any field; an object with any other keys is data. A shape's own parts are read as it says.
// a place (things.md): a point { lat, lon } in WGS84 degrees, or an area, a point with a radius in m
const deg = (x, lim) => isStr(x) && RX.decimal.test(x) && decCmp(x.replace(/^-/, ''), lim) <= 0;
const whereOk = w => isObj(w) && Object.keys(w).every(k => P.shapes.where.area.includes(k)) && deg(w.lat, '90') && deg(w.lon, '180') && (w.radius === undefined || (isObj(w.radius) && !amountProblem(w.radius) && w.radius.unit === 'm'));
const SHAPES = [['amount', P.shapes.amount], ['money', P.shapes.money], ['price_per', P.shapes.price_per], ['range', P.shapes.range], ['mark', P.shapes.mark], ['share', P.shapes.share], ['currency_unit', P.shapes.currency_unit], ['point', P.shapes.where.point], ['area', P.shapes.where.area], ['bound', P.shapes.bound]];
const shapeOf = v => { if (!isObj(v)) return null; if ('figure' in v) return figureKeys(v) ? 'price_figure' : null; const ks = Object.keys(v); const hit = SHAPES.find(([, keys]) => keys.length === ks.length && keys.every(k => ks.includes(k))); return hit ? hit[0] : null; };
function shapeValue(v, out, key) {
  if (Array.isArray(v)) { v.forEach(x => shapeValue(x, out, key)); return; }
  const bad = c => c && out.push({ code: c, detail: 'shape at ' + key });
  switch (shapeOf(v)) {
    case 'amount': bad(amountProblem(v)); break;
    case 'money': bad(moneyProblem(v)); break;
    case 'price_per': priceProblems(v).forEach(bad); break;
    case 'price_figure': figureProblems(v).forEach(bad); break;
    case 'range': quantityProblems(v, { per: {} }).forEach(bad); break;
    case 'mark': if (!isStr(v.scheme) || !isStr(v.value)) bad('shape'); break;
    case 'share': bad(idProblem(v.from)); if (!isStr(v.share) || !RX.decimal.test(v.share)) bad('decimal'); break;
    case 'currency_unit': bad(currencyProblem(v)); break;
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
      const sh = shapeOf(v), parts = sh === 'amount' ? [v] : sh === 'price_per' ? [v.per] : sh === 'range' ? [v.min, v.max] : [];
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
    if (pl.data.includes(k)) continue; // not a place: a schema's fields, grounds and roles, and the items of shares, are data (encoding.md, Shapes)
    if (BARE_FIELDS.includes(k) && shapeOf(x) === null) out.push({ code: 'shape', detail: 'a bare field holds exactly one shape at ' + key + '.' + k });
    shapeValue(x, out, key + '.' + k);
    if (pl.containers.includes(k)) shapeFindings(x, out, key + '.' + k);
    else if (pl.lists.includes(k) && Array.isArray(x)) x.forEach(i => shapeFindings(i, out, key + '.' + k));
  }
}

function contentFindings(b, ctx) {
  const out = [];
  const add = (stage, code, detail) => out.push({ stage, code, detail: detail || '' });
  const whole = isObj(b) && ['type', 'state', 'refs'].every(k => k in b);
  // ---- stage 1: exactly {type,state,refs}, strict writing
  if (!isObj(b) || !whole || Object.keys(b).some(k => !['type', 'state', 'refs'].includes(k))) { add(1, 'not_canonical', 'not exactly type, state and refs'); return out; }
  const { type, state, refs } = b;
  if (!isObj(state)) add(1, 'not_canonical', 'state is not an object');
  if (!isObj(refs)) add(1, 'not_canonical', 'refs is not an object');
  if (out.length) return out;
  const walk = (v, path) => {
    if (v === null) return add(1, 'not_canonical', 'null at ' + path.join('.'));
    if (isStr(v)) { if (v !== v.normalize('NFC') || lonePair(v)) add(1, 'not_canonical', 'not NFC at ' + path.join('.')); return; }
    if (typeof v === 'number') {
      // from 1e21 on, JSON (RFC 8785) writes a number with an exponent, so it is a float whatever its value
      if (!Number.isInteger(v) || Math.abs(v) >= 1e21) add(2, 'float', path.join('.'));
      else if (Object.is(v, -0) || Math.abs(v) > MAXI) add(2, 'integer_range', path.join('.'));
      return;
    }
    if (typeof v === 'boolean') return;
    if (Array.isArray(v)) {
      if (path.length === 2 && path[0] === 'refs' && v.every(isStr)) for (let i = 1; i < v.length; i++) if (!(v[i - 1] < v[i])) { add(1, 'not_canonical', 'a set under ' + path.join('.') + ' is not sorted, or repeats'); break; }
      v.forEach((x, i) => walk(x, [...path, i])); return;
    }
    if (isObj(v)) for (const [k, x] of Object.entries(v)) { if (k !== k.normalize('NFC') || lonePair(k)) add(1, 'not_canonical', 'key not NFC'); walk(x, [...path, k]); }
  };
  walk(state, ['state']); walk(refs, ['refs']);
  // ---- stage 2: values
  if (!isStr(type) || !RX.type_name.test(type)) add(2, 'type_name', String(type)); // core.md section 1: a type is a word matching grammar.type_name
  for (const k of P.refs_single) if (isObj(refs) && Array.isArray(refs[k])) add(2, 'grammar', 'refs.' + k + ' is one id'); // core.md section 1: author, prev, answers and updates each hold one id
  // a link is one id or a sorted set of ids, never an empty set (core.md section 5)
  for (const [k, v] of Object.entries(refs)) { if (Array.isArray(v) && !v.length) add(2, 'grammar', 'refs.' + k + ' is an id or a set of ids'); for (const id of asList(v)) { const p = idProblem(id); if (p) add(2, p, 'refs.' + k); } }
  const timeAt = (o, where) => {
    if (!isObj(o)) return;
    for (const f of TIME_FIELDS) if (f in o) {
      const v = o[f];
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
  for (const flag of ['skip', 'withheld']) if (flag in state && state[flag] !== true) add(2, 'shape', 'state.' + flag + ' is true, or left out');
  for (const k of ['line', 'channel']) if (k in state && !isStr(state[k])) add(2, 'shape', 'state.' + k + ' is text');
  // an opening (privacy.md, A commitment) is { salt, value }, the salt in its grammar; a conditioned transfer carries its condition whole (things.md)
  if ('opening' in state && !(isObj(state.opening) && Object.keys(state.opening).every(k => P.shapes.reveal.includes(k)) && isStr(state.opening.salt) && RX.salt.test(state.opening.salt) && state.opening.value !== undefined)) add(2, 'shape', 'state.opening is { salt, value }');
  if ('condition' in state && conditionProblem(state.condition)) add(2, 'shape', 'state.condition');
  // a ruling's up_to is the harm it finds: money, or an amount of a thing (promises.md, A claim of invasion)
  if ('up_to' in state && !['money', 'amount'].includes(shapeOf(state.up_to))) add(2, 'shape', 'state.up_to');
  // marks, on any type, open or closed (things.md): a list of exactly { scheme, value }, both text
  if ('marks' in state && !(Array.isArray(state.marks) && state.marks.every(m => isObj(m) && Object.keys(m).every(k => P.shapes.mark.includes(k)) && isStr(m.scheme) && isStr(m.value)))) add(2, 'shape', 'state.marks lists exact marks [{ scheme, value }]');
  if ('nonce' in state && (!isStr(state.nonce) || !RX.nonce.test(state.nonce))) add(2, 'grammar', 'nonce');
  for (const f of ['counted_to', 'custodian', 'recovery_key_hash', 'assisted_by']) if (f in state) { const p = idProblem(state[f]); if (p) add(2, p, f); }
  for (const f of ['parties']) if (f in state) for (const id of asList(state[f])) { const p = idProblem(id); if (p) add(2, p, f); }
  // a commitment is written like an id: one in state.audience with a hash name the reader does not know is unknown_suite (core.md, section 2)
  if (Array.isArray(state.audience) && state.audience.some(x => isStr(x) && RX.id.test(x) && idProblem(x) === 'unknown_suite')) add(2, 'unknown_suite', 'state.audience');
  // suites and keys
  for (const f of ['suite', 'recovery_suite']) if (f in state && !SUITES.includes(state[f])) add(2, 'unknown_suite', f);
  const ks = SUITES.includes(state.suite) ? state.suite : 'std';
  if ('public_key_sign' in state && !(isStr(state.public_key_sign) && keyGrammar(ks).test(state.public_key_sign) && keySound(state.public_key_sign))) add(2, 'unknown_suite', 'public_key_sign');
  for (const f of ['replaces', 'recovery_key']) if (f in state && (suiteOfKey(state[f]) === null || !keySound(state[f]))) add(2, 'unknown_suite', f);
  if ('public_key_encrypt' in state && !(isStr(state.public_key_encrypt) && encGrammar(ks).test(state.public_key_encrypt))) add(2, 'unknown_suite', 'public_key_encrypt');
  { const found = []; shapeFindings(state, found, 'state'); if (type === 'promise' || type === 'transfer') amountsBelowZero(state, found, 'state'); found.forEach(x => add(2, x.code, x.detail)); }
  // the codes of one check come in the order protocol.json lists them (core.md section 8)
  { const ord = Object.keys(P.refusals.codes.block); out.sort((x, y) => x.stage - y.stage || ord.indexOf(x.code) - ord.indexOf(y.code)); }
  if (out.some(o => o.stage <= 2)) return out;
  // ---- stage 3: size
  if (Buffer.byteLength(canonical(type, state, refs), 'utf8') > P.limits.block_bytes) add(3, 'size_limit', 'over ' + P.limits.block_bytes);
  if (1 + Math.max(depthOf(state), depthOf(refs)) > P.limits.depth) add(3, 'size_limit', 'nests deeper than ' + P.limits.depth);
  if (asList(refs.after).length > P.limits.after_heads) add(3, 'after_limit', 'after names more than ' + P.limits.after_heads);
  if (out.length) return out;
  // ---- stage 4: genesis, or the common five
  const isActor = type === 'actor';
  // a genesis is the one actor with no author, or one that names a signing key (core.md section 4: a key comes in by a key grant); any other actor is an ordinary block
  const genesis = isActor && (refs.author === undefined || 'public_key_sign' in state);
  if (genesis) {
    const bad = [];
    if (refs.author !== undefined || refs.prev !== undefined || refs.after !== undefined || state.seq !== undefined) bad.push('has author, prev, after or seq');
    for (const f of P.genesis.required) if (!(f in state) || (f !== 'audience' && (!isStr(state[f]) || state[f] === ''))) bad.push('missing ' + f);
    if (('recovery_key_hash' in state) !== ('recovery_reach' in state)) bad.push('only one of the recovery fields');
    const allowed = new Set([...P.genesis.required, ...P.key_fields.fields.filter(f => f !== 'roles'), ...P.genesis.recovery, ...P.genesis.private]);
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
    if (state.at === undefined && !['observe', 'transform', 'transfer'].includes(type)) add(4, 'at_missing', type);
    // a consent yes widens what reaches her, so it names whom it is about; only stop, keep and move may leave it out (consent.md)
    if (type === 'observe' && state.kind === 'consent' && state.word === 'yes' && refs.subject === undefined) add(4, 'required', 'a consent yes names whom it is about in refs.subject');
  }
  if (out.length) return out;
  // ---- stage 7: closed types and their modules (stages 5 and 6 need keys and a chain: valid())
  if (CLOSED.has(type) && !genesis && !ctx.noClosed) closedFindings(b, ctx, add);
  return out;
}

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
  if (type === 'promise') req(refs.updates === undefined || refs.answers !== undefined || state.status === 'stopped', 'an updates of a promise is its author\'s stop (state.status stopped)');
  if (type === 'actor') { if (!asAnswer) req(isStr(state.kind) && state.kind !== '', 'actor kind'); }
  if (type === 'grant') {
    if (!asAnswer) {
      req(isStr(state.kind) && state.kind !== '', 'grant kind');
      if (state.kind === 'key') {
        req(refs.subject !== undefined, 'key grant subject');
        // the recovery pair is named only in the genesis (identity.md): in a key grant it is an undeclared field
        req('public_key_sign' in state || 'public_key_encrypt' in state, 'a key grant names a key');
        if ('replaces' in state) { req('counted_to' in state, 'a rotation names counted_to'); req('public_key_sign' in state, 'a rotation names the new key'); }
        if ('counted_to' in state && !('replaces' in state)) req(false, 'a rotation names both the key it replaces and its counted_to');
      }
      if (state.kind === 'member') {
        req(refs.subject !== undefined, 'member grant subject'); req(refs.as !== undefined && refs.as === refs.subject, 'member grant is signed as the circle');
        if ('roles' in state && !(Array.isArray(state.roles) && state.roles.every(r => isStr(r) && r !== ''))) add(A, 'shape', 'state.roles lists the role names it gives (text)');
      }
      if (state.kind === 'operator') req(refs.to !== undefined, 'operator grant names the agent in refs.to');
    }
  }
  if (type === 'transfer' && !asAnswer) {
    req(refs.what !== undefined || state.money !== undefined, 'transfer what'); // a payment (state.money) is the exemption: it names no thing (core.md section 7)
    req(['to_owner', 'to_holder', 'to_place'].some(k => refs[k] !== undefined) || state.count !== undefined, 'transfer moves something');
  }
  if (type === 'promise' && !asAnswer && !counter) req(refs.what !== undefined || state.what !== undefined, 'promise what');
  // undeclared
  // A schema the block names declares more fields (its `fields`) and more ref keys (its `roles`), when the checker keeps a schema store
  // (the door's `schemas` list). With no store the fields a schema may declare are not judged; with one, a named schema it does not hold is
  // `undeclared_ref` (ask for it) (core.md, section 8).
  const store = ctx.schemas, schema = refs.schema && store ? store.get(refs.schema) : undefined;
  if (!refs.schema || schema) {
    // only a schema declares: a thing of kind schema; any other block named in refs.schema widens nothing
    const asSchema = schema && schema.type === 'thing' && isObj(schema.state) && schema.state.kind === 'schema' ? schema : undefined;
    const declared = asSchema && isObj(asSchema.state.fields) ? Object.keys(schema.state.fields) : [];
    const roles = asSchema && Array.isArray(asSchema.state.roles) ? asSchema.state.roles : [];
    const allowed = new Set([...FIELDS_EVERY, ...PROFILE_FIELDS.every, ...baseFields(type), ...(PROFILE_FIELDS[type] || []), ...declared]);
    for (const k of Object.keys(state)) if (!allowed.has(k)) add(A, 'undeclared_field', k);
    // a key, its suite and its custodian are named by a genesis or a key grant alone (core.md, sections 2 and 4): never another actor, never another
    // grant, never a stop or an answer
    const keyHolder = type === 'grant' && state.kind === 'key' && state.status === undefined;
    if (!keyHolder) for (const k of ['public_key_sign', 'suite', 'custodian', ...(type === 'grant' ? ['public_key_encrypt'] : [])]) if (k in state) add(A, 'undeclared_field', k);
    for (const k of Object.keys(refs)) if (!SHARED_REFS.has(k) && !roles.includes(k)) add(A, 'undeclared_ref', k);
    // a promise's terms are the protocol's (protocol.json terms) and those its schema declares (state.terms, promises.md, Terms): no fold reads a
    // term it does not know, so a schema's own term binds no one
    if (type === 'promise' && isObj(state.terms)) {
      const declaredTerms = asSchema && isObj(asSchema.state.terms) ? Object.keys(asSchema.state.terms) : [];
      for (const k of Object.keys(state.terms)) if (!P.terms.includes(k) && !declaredTerms.includes(k)) add(A, 'undeclared_field', 'terms.' + k);
    }
  } else if (store) add(A, 'undeclared_ref', 'refs.schema names a schema this node does not hold');
  // module checks
  if (type === 'actor' && (state.kind === 'circle' || 'roles' in state)) {
    const roles = state.roles;
    const ok = Array.isArray(roles) && roles.length > 0 && roles.every(r => isObj(r) && Object.keys(r).every(k => k === 'name' || k === 'powers') && isStr(r.name) && r.name && !r.name.includes('#') && Array.isArray(r.powers) && r.powers.every(p => POWERS.has(p)) && new Set(r.powers).size === r.powers.length) && new Set(roles.map(r => r.name)).size === roles.length;
    if (!ok) add(A, 'bad_roles', 'a circle lists roles [{ name (no #), powers (each once) }], each name once, and the founder holds the first');
  }
  // a rekey (profiles/rekeys.md): state.epoch a whole number, signed as the circle, with the sealed keys and epoch n-1 in refs.after
  if (type === 'grant' && state.kind === 'key' && 'epoch' in state && !asAnswer) { // an answer is never a grant: no key-grant rule reads it
    if (!(Number.isInteger(state.epoch) && state.epoch >= 1)) add(A, 'shape', 'state.epoch is a whole number of at least 1');
    if (refs.as === undefined) add(A, 'required', 'a rekey is signed as the circle');
    if (state.keys === undefined || refs.after === undefined) add(A, 'required', 'a rekey holds state.keys and names epoch n-1 in refs.after');
  }
  // the removal rule (circles.md): { needed: N }, N a whole number of at least 1; left out, nothing holds (folds.md, Counts)
  if (type === 'actor' && 'removal' in state && !(isObj(state.removal) && Object.keys(state.removal).every(k => P.circle.removal.includes(k)) && Number.isInteger(state.removal.needed) && state.removal.needed >= 1)) add(A, 'shape', 'state.removal is { needed: N }');
  if (['promise', 'grant', 'transfer'].includes(type)) { // a status goes with an answer or the author's own stop; a stop goes with status stopped
    const stopOk = x => x === 'before' || x === 'onward' || (isObj(x) && Object.keys(x).every(k => k === 'occurrences') && Array.isArray(x.occurrences) && x.occurrences.every(o => isStr(o) && (timeProblem(o) === null || RX.hash.test(o))));
    // a stop goes only with status stopped (promises.md); it says nothing of why
    if (state.status === undefined) { if ('stop' in state) add(A, 'bad_status', 'state.stop goes with status stopped'); }
    else {
      if (!answer && refs.updates === undefined) add(A, 'status_not_answer', 'status on a block that neither answers nor updates');
      if (!STATUSES.has(state.status)) add(A, 'bad_status', String(state.status));
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
    // a refrain (promises.md, Refrain): true, with an until
    if ('refrain' in terms) { if (terms.refrain !== true) add(A, 'shape', 'terms.refrain is true'); else if (terms.until === undefined) add(A, 'required', 'a promise not to do something carries terms.until'); }
    if ('zone' in terms && !zoneOk(terms.zone)) add(A, 'grammar', 'terms.zone is an IANA time zone name');
    // a wrapped condition names its deadline and keepers (promises.md, By a time); terms.keepers is a named clock (blocks.md)
    if ('condition' in terms && conditionProblem(terms.condition)) add(A, 'shape', 'terms.condition');
    if ('keepers' in terms && keepersOf(terms.keepers) === null) add(A, 'shape', 'terms.keepers is { names, needed }');
    // catch weight (promises.md, Terms): terms.band is a decimal from 0 to 1, a fraction of the quantity chosen
    if ('band' in terms && !(isStr(terms.band) && dec(terms.band) && RX.decimal.test(terms.band) && decCmp(terms.band, '0') >= 0 && decCmp(terms.band, '1') <= 0)) add(A, 'shape', 'terms.band is a decimal from 0 to 1');
    // what the payer gives up if the deal ends before it is done (money), and what is owed that cannot be handed on (true): promises.md, Terms
    if ('forfeit' in terms) { const c = moneyProblem(terms.forfeit); if (c) add(A, c, 'terms.forfeit'); else if (terms.forfeit.minor < 0) add(A, 'shape', 'terms.forfeit is zero or more'); }
    if ('backing' in terms) { const unit = isObj(terms.backing) && 'unit' in terms.backing; const c = unit ? amountProblem(terms.backing) : moneyProblem(terms.backing); if (c) add(A, c, 'terms.backing'); else if (unit ? decCmp(terms.backing.value, '0') < 0 : terms.backing.minor < 0) add(A, 'shape', 'terms.backing is zero or more'); }
    if ('personal' in terms && terms.personal !== true) add(A, 'shape', 'terms.personal is true');
    // an answer that carries a status names no term but the quantity it chooses (promises.md, Answers)
    if (state.status !== undefined) for (const k of Object.keys(terms)) if (k !== 'quantity') add(A, 'undeclared_field', 'terms.' + k + ' on an answer');
    // a repeat is an RRULE (one FREQ part, any calendar named by RSCALE) counted from state.when, or an event { after, by, wait }
    if ('repeat' in terms) {
      const r = terms.repeat, named = x => isStr(x) && x !== '';
      if (isStr(r)) { if (!rruleOk(r)) add(A, 'grammar', 'terms.repeat is an RRULE'); if (state.when === undefined) add(A, 'shape', 'a repeat counts from state.when'); if (terms.zone === undefined) add(A, 'shape', 'a calendar repeat is read in terms.zone'); }
      else if (isObj(r)) {
        if (Object.keys(r).some(k => !P.repeat.keys.includes(k)) || !named(r.after) || (r.by !== undefined && !(Array.isArray(r.by) && r.by.length && r.by.every(x => isStr(x) && (RX.id.test(x) || RX.role_ref.test(x)))))) add(A, 'shape', 'a repeat on an event is { after, by, wait }');
        // GUESS: by and wait may be left out (the text names { after, by, wait } and reads by as optional; it does not say wait is required)
        if ('wait' in r) { const q = durationProblem(r.wait); if (q) add(A, q, 'terms.repeat.wait'); }
      } else add(A, 'grammar', 'terms.repeat is an RRULE');
    }
    if ('lines' in terms && !(Array.isArray(terms.lines) && terms.lines.length)) add(A, 'lines', 'terms.lines lists { id, what, quantity, price }');
    for (const c of [...priceProblems(terms.price), ...quantityProblems(terms.quantity, terms.price)]) add(A, c, 'terms price or quantity');
    if (Array.isArray(terms.lines)) {
      for (const l of terms.lines) {
        if (!isObj(l) || Object.keys(l).some(k => !P.line.includes(k))) add(A, 'lines', 'a line is { id, what, quantity, price }');
        if (!isObj(l)) continue;
        if (!isStr(l.what) || idProblem(l.what)) add(A, 'lines', 'a line\'s what is a thing\'s hash');
        for (const c of [...priceProblems(l.price), ...quantityProblems(l.quantity, l.price)]) add(A, c, 'line price or quantity');
        if (isObj(l.price) && 'figure' in l.price) add(A, 'lines', 'a line\'s price is money or an amount: a price fixed later is on the whole promise');
        // a line's quantity is an amount, never a range: no answer chooses within one line (promises.md, Terms)
        if (isObj(l.quantity) && ('min' in l.quantity || 'max' in l.quantity)) add(A, 'lines', 'a line\'s quantity is an amount, never a range');
      }
      const ids = terms.lines.map(l => isObj(l) ? l.id : undefined);
      if (ids.some(i => !isStr(i) || i === '') || new Set(ids).size !== ids.length) add(A, 'lines', 'a line has an id unique in the promise');
      else if (terms.price !== undefined || terms.quantity !== undefined) add(A, 'lines', 'lines and a top-level price or quantity');
      // one promise has one currency: every line's price is in it (money in different currencies is never added)
      const curs = new Set(terms.lines.filter(l => isObj(l) && isObj(l.price)).map(l => (perUnit(l.price) ? (isObj(l.price.money) ? l.price.money.currency : undefined) : l.price.currency)).filter(x => x !== undefined).map(jcs));
      if (curs.size > 1) add(A, 'lines', 'every line of one promise is priced in one currency');
      else if (terms.lines.every(l => isObj(l) && isStr(l.what))) { const w = [...new Set(terms.lines.map(l => l.what))].sort(), r = [...new Set(asList(refs.what))].sort(); if (jcs(w) !== jcs(r)) add(A, 'lines', 'refs.what is not the set of the lines\' what'); }
    }
  }
  // a grant to a role (authority.md): refs.to the circle, state.to_role the role's name
  if (type === 'grant' && 'to_role' in state) {
    if (!(isStr(state.to_role) && state.to_role !== '')) add(A, 'shape', 'state.to_role is a role\'s name');
    if (refs.to === undefined) add(A, 'required', 'a grant to a role names the circle in refs.to');
    if (Number.isInteger(state.depth) && state.depth >= 1) add(A, 'shape', 'a grant to a role is not passed on');
    if (['key', 'member', 'operator', 'successor'].includes(state.kind)) add(A, 'shape', 'a key, member, operator or successor grant is never to a role');
  }
  // a grant's depth is a whole number of 0 or more (authority.md)
  if (type === 'grant' && 'depth' in state && !(Number.isInteger(state.depth) && state.depth >= 0)) add(A, 'shape', 'state.depth is a whole number');
  // terms.needs is data under a schema, never a bare name (promises.md)
  if (type === 'promise' && isObj(state.terms) && 'needs' in state.terms && !(isObj(state.terms.needs) || Array.isArray(state.terms.needs))) add(A, 'shape', 'terms.needs is data from a schema');
  // a successor grant (profiles/successor.md): names the successor, the witnesses (a set of ids), how many of them must record it (1 to their
  // number), and the wait (a duration); it never carries signing keys
  if (type === 'grant' && state.kind === 'successor' && !asAnswer && state.status === undefined) {
    if (refs.to === undefined) add(A, 'required', 'a successor grant names the successor');
    const ws = state.witnesses;
    if (ws === undefined) add(A, 'required', 'state.witnesses');
    else if (!(Array.isArray(ws) && ws.length && ws.every(x => isStr(x) && RX.id.test(x)))) add(A, 'grammar', 'state.witnesses is a set of hashes');
    else if (ws.some(x => idProblem(x) === 'unknown_suite')) add(A, 'unknown_suite', 'state.witnesses names a hash this reader does not know');
    if (Array.isArray(ws) && new Set(ws).size !== ws.length) add(A, 'shape', 'state.witnesses names each witness once');
    // the successor is never a witness: no one records the event that gives them power (profiles/successor.md)
    if (Array.isArray(ws) && refs.to !== undefined && ws.includes(refs.to)) add(A, 'shape', 'the successor is not one of the witnesses');
    // a number that is stated is a whole number from 1 to the witnesses; one left out means nothing holds (folds.md, Counts)
    if (state.needed !== undefined && !(Number.isInteger(state.needed) && state.needed >= 1 && state.needed <= (Array.isArray(ws) ? ws.length : 0))) add(A, 'shape', 'state.needed is 1 to the number of witnesses');
    if (state.wait === undefined) add(A, 'required', 'state.wait');
    else { const q = durationProblem(state.wait); if (q) add(A, q, 'state.wait'); }
    if ('public_key_sign' in state) add(A, 'undeclared_field', 'a successor gets decryption keys only');
  }
  // many hands (circles.md): state.needed { power: N } for the powers circle.needed lists, N a whole number of at least 1
  if (type === 'actor' && 'needed' in state && !(isObj(state.needed) && Object.entries(state.needed).every(([k, n]) => P.circle.needed.includes(k) && ((Number.isInteger(n) && n >= 1) || n === 'all' || shareOfMembers(n))))) add(A, 'shape', 'state.needed is { power: N }');
  // a grant's scope, whatever its kind (authority.md): an object, its acts a list of acts, its parties ids. A stop or an answer is never a grant,
  // whatever scope it restates: no scope rule reads it
  if (type === 'grant' && 'scope' in state && !asAnswer) {
    if (!isObj(state.scope)) add(A, 'shape', 'state.scope is an object');
    else {
      if (state.scope.acts !== undefined && !(Array.isArray(state.scope.acts) && state.scope.acts.every(isStr))) add(A, 'shape', 'scope.acts lists acts');
      if (state.scope.parties !== undefined && !(Array.isArray(state.scope.parties) && state.scope.parties.every(x => isStr(x) && RX.id.test(x)))) add(A, 'grammar', 'scope.parties lists hashes');
      else if (Array.isArray(state.scope.parties) && state.scope.parties.some(x => idProblem(x) === 'unknown_suite')) add(A, 'unknown_suite', 'scope.parties names a hash this reader does not know');
    }
  }
  // a payment for several promises (things.md): state.split is a non-empty list of { for, line, money }, each `for` one of refs.for, its money money
  // and its line, when given, a line id
  if (type === 'transfer' && 'split' in state) {
    const parts = state.split;
    if (!Array.isArray(parts) || !parts.length) add(A, 'shape', 'state.split lists { for, line, money }');
    else for (const x of parts) {
      if (!isObj(x) || Object.keys(x).some(k => !P.shapes.split.includes(k)) || !asList(refs.for).includes(x.for)) add(A, 'shape', 'state.split[].for is one of refs.for');
      if (!isObj(x) || shapeOf(x.money) !== 'money') add(A, 'shape', 'state.split[].money is money');
      if (isObj(x) && x.line !== undefined && !isStr(x.line)) add(A, 'shape', 'state.split[].line is a line id');
      if (isObj(x) && x.occurrence !== undefined && !(isStr(x.occurrence) && (timeProblem(x.occurrence) === null || RX.hash.test(x.occurrence)))) add(A, 'shape', 'state.split[].occurrence is a start time or a hash');
    }
  }
  // a payment for several promises says how much goes to each (things.md, Transfers): its split, the payment's own money, in its currency and adding
  // up to no more than it
  if (type === 'transfer' && !asAnswer && 'money' in state && !('split' in state) && asList(refs.for).length > 1) add(A, 'required', 'a payment for several promises says how much goes to each (state.split)');
  const intMoney = m => shapeOf(m) === 'money' && Number.isInteger(m.minor);
  if (type === 'transfer' && Array.isArray(state.split) && intMoney(state.money) && state.split.every(x => isObj(x) && intMoney(x.money))) {
    if (state.split.some(x => jcs(x.money.currency) !== jcs(state.money.currency))) add(A, 'shape', 'every part of state.split is in the payment\'s own currency');
    else if (state.split.reduce((t, x) => t + BigInt(x.money.minor), 0n) > BigInt(state.money.minor)) add(A, 'shape', 'state.split adds up to no more than state.money');
  }
  // what a payment covers is the word of the side it is paid to (promises.md, Settling): money, only on that side's accepted answer
  if (type === 'transfer' && 'covers' in state) {
    const c = isObj(state.covers) && 'unit' in state.covers ? amountProblem(state.covers) : moneyProblem(state.covers);
    if (c) add(A, c, 'state.covers is money or an amount');
    if (refs.answers === undefined || state.status !== 'accepted') add(A, 'shape', 'state.covers goes only on an accepted answer to a payment');
  }
  // a payment names the occurrence of a standing promise it pays (promises.md, Settling; decision E4): its start time, or the hash of the block that
  // started it, as a stop names occurrences
  if (type === 'transfer' && 'occurrence' in state && !((isStr(state.occurrence) && (timeProblem(state.occurrence) === null || RX.hash.test(state.occurrence))) && state.money !== undefined)) add(A, 'shape', 'state.occurrence goes on a payment: a start time, or the hash of the block that started it');
  // how many received (things.md): a whole number of at least 1
  if (type === 'transfer' && 'keepers' in state && (refs.to_owner !== undefined || keepersOf(state.keepers) === null)) add(A, 'shape', 'state.keepers goes on an open hand-over and is { names, needed }');
  if (type === 'transfer' && 'keepers' in state && (refs.to_owner !== undefined || keepersOf(state.keepers) === null)) add(A, 'shape', 'state.keepers goes on an open hand-over and is { names, needed }');
  if (type === 'transfer' && 'count' in state && !(Number.isInteger(state.count) && state.count >= 1)) add(A, 'shape', 'state.count is a whole number from 1');
  // the scope's own rules hold whatever the kind (a grant with no kind is refused for that too)
  if (type === 'grant' && !asAnswer) {
    const scope = isObj(state.scope) ? state.scope : null;
    if (scope) for (const k of Object.keys(scope)) if (!P.scope.includes(k)) add(A, 'undeclared_field', 'scope.' + k);
    // a limit, and a cap on each act, are money or an amount (authority.md); a sealed scope keeps each inside its commitment
    // a limit below zero allows nothing and says nothing: refused (authority.md)
    if (scope) for (const k of ['limit', 'each']) if (scope[k] !== undefined) { const unit = isObj(scope[k]) && 'unit' in scope[k]; const c = unit ? amountProblem(scope[k]) : moneyProblem(scope[k]); if (c) add(A, c, 'scope.' + k); else if (unit ? decCmp(scope[k].value, '0') < 0 : scope[k].minor < 0) add(A, 'shape', 'scope.' + k + ' is zero or more'); }
    if (scope && scope.limit_commitment !== undefined && scope.each !== undefined) add(A, 'shape', 'a sealed limit keeps each inside its commitment');
    if (scope && scope.limit_commitment !== undefined) { // a sealed limit (authority.md): a commitment, and never beside a visible limit
      if (!isStr(scope.limit_commitment) || !RX.id.test(scope.limit_commitment)) add(A, 'grammar', 'scope.limit_commitment is a commitment');
      else if (idProblem(scope.limit_commitment)) add(A, idProblem(scope.limit_commitment), 'scope.limit_commitment');
      if (scope.limit !== undefined) add(A, 'shape', 'a visible limit or a limit_commitment, never both');
    }
    // a grant may carry scope.until or not, whatever its kind (decision H11): with one it ends then, with none it lasts until its author stops it
    if (refs.parent !== undefined) {
      const parent = held.get(refs.parent);
      if (parent) {
        // a circle that received it passes it on by a block signed as the circle; whether the signer may sign for it there is the fold's (decision D15)
        if (!isStr(parent.refs.to) || (parent.refs.to !== refs.author && parent.refs.to !== refs.as)) add(A, 'not_receiver', 'passed on by someone other than the receiver');
        if (!scopeWithin(state, parent.state)) add(A, 'wider_than_parent', 'wider than the parent');
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
function scopeWithin(child, parent) {
  const c = isObj(child.scope) ? child.scope : {}, p = isObj(parent.scope) ? parent.scope : {};
  if (!narrowerThan(c, p, isStr(parent.at) && parent.at !== '' ? parent.at : null)) return false;
  // a sealed limit is compared only where the amount is (the principal's node); here the child must still carry a limit
  if (p.limit_commitment !== undefined && c.limit_commitment === undefined && c.limit === undefined) return false;
  // a limit with no period covers all time: a child with a period under it could spend it again every period
  if (p.limit !== undefined && p.every === undefined && c.every !== undefined) return false;
  const pd = parent.depth === undefined ? 0 : parent.depth, cd = child.depth === undefined ? 0 : child.depth;
  return pd >= 1 && cd <= pd - 1;
}

// ---- the check as the door gives it
function check(block, held, schemas) {
  const ctx = { held: normHeld(held), schemas: Array.isArray(schemas) ? normHeld(schemas) : null };
  return refusalOf(contentFindings(block, ctx));
}
// The refusal of a check: the findings of the first stage that failed, one per code, in the order of protocol.json refusals.codes.block (core.md, section 8)
const CODE_ORDER = Object.keys(P.refusals.codes.block);
const inCodeOrder = list => uniqueCodes(list).sort((a, b) => CODE_ORDER.indexOf(a.code) - CODE_ORDER.indexOf(b.code));
const refusalOf = found => (found.length ? inCodeOrder(found.filter(f => f.stage === Math.min(...found.map(g => g.stage)))) : []);
const refusals = (type, state, refs, held, schemas) => check({ type, state, refs }, held, schemas);

// strict_text: a block as TEXT. Duplicate keys and number tokens are visible only here.
function strictText(text) {
  let i = 0; const extra = [];
  const ws = () => { while (i < text.length && ' \t\n\r'.includes(text[i])) i++; }; // JSON's four (RFC 8259), no other space
  const fail = () => { throw new Error('not JSON'); };
  function value() {
    ws();
    const c = text[i];
    if (c === '{') {
      i++; const o = {}; ws();
      if (text[i] === '}') { i++; return o; }
      for (;;) {
        ws(); const k = str(); ws(); if (text[i++] !== ':') fail();
        if (Object.prototype.hasOwnProperty.call(o, k)) extra.push({ stage: 1, code: 'not_canonical', detail: 'duplicate key ' + k });
        // a key is a key whatever its name: __proto__ too is an own property, never the object's prototype (canonical/proto)
        Object.defineProperty(o, k, { value: value(), enumerable: true, writable: true, configurable: true }); ws();
        if (text[i] === ',') { i++; continue; } if (text[i] === '}') { i++; return o; } fail();
      }
    }
    if (c === '[') { i++; const a = []; ws(); if (text[i] === ']') { i++; return a; } for (;;) { a.push(value()); ws(); if (text[i] === ',') { i++; continue; } if (text[i] === ']') { i++; return a; } fail(); } }
    if (c === '"') return str();
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i));
    if (m && /^-?0\d/.test(text.slice(i))) fail(); // a leading zero is not JSON
    if (m) {
      const tail = m[3];
      i += m[0].length;
      if (tail && !Number.isFinite(Number(m[0]))) fail(); // 1e999 is no number a block can hold
      // a negative zero in any form (-0, -0.0, -0e0) is -0, which is refused as integer_range (core.md, section 3)
      if (Object.is(Number(m[0]), -0)) return -0;
      // a number with a fraction or exponent is a float, whatever its value; a whole one (5.0, 1e2) is read as its value, as any reader of the
      // value does, beside the float it is (so only float is said of it, as of seq 1.0)
      if (m[2] || m[3]) { const n = Number(m[0]); if (Number.isSafeInteger(n)) { extra.push({ stage: 2, code: 'float', detail: 'a number written as a float' }); return n; } return 0.5; }
      return Number(m[0]);
    }
    for (const [w, v] of [['true', true], ['false', false], ['null', null]]) if (text.startsWith(w, i)) { i += w.length; return v; }
    fail();
  }
  function str() { if (text[i] !== '"') fail(); let j = i + 1; while (text[j] !== '"') { if (text[j] === '\\') j++; j++; } const s = JSON.parse(text.slice(i, j + 1)); i = j + 1; return s; }
  // read to limits.depth_read deep and no deeper (encoding.md)
  { let d = 0, most = 0, inStr = false; for (let j = 0; j < text.length; j++) { const c = text[j]; if (inStr) { if (c === '\\') j++; else if (c === '"') inStr = false; } else if (c === '"') inStr = true; else if (c === '[' || c === '{') most = Math.max(most, ++d); else if (c === ']' || c === '}') d = Math.max(0, d - 1); }
    if (most > P.limits.depth_read) return [{ code: 'not_canonical', detail: 'not JSON: nested deeper than limits.depth_read' }]; }
  let b;
  try { b = value(); ws(); if (i !== text.length) fail(); } catch { return [{ code: 'not_canonical', detail: 'not JSON' }]; }
  return refusalOf([...extra, ...contentFindings(b, { held: new Map() })]);
}

// A push read from its bytes (nodes.md, Push): JSON text with no repeated key anywhere and no deeper than limits.depth_read, else an
// argument error; then each message's block as its own text says (strictText), a sealed message none.
function strictPush(text) {
  // scanned, never built into values and with no recursion: nothing inside one block (a number too large, a lone surrogate, a depth) makes the
  // push unreadable; each block is judged by its own text, as strict_text
  if (typeof text !== 'string') throw argError('a push is JSON text');
  const fail = () => { throw argError('a push is JSON text with no repeated key'); };
  let i = 0;
  const ws = () => { while (i < text.length && ' \t\n\r'.includes(text[i])) i++; };
  const str = () => { if (text[i] !== '"') fail(); let j = i + 1; while (j < text.length && text[j] !== '"') { if (text[j] === '\\') j++; j++; } if (j >= text.length) fail(); let v; try { v = JSON.parse(text.slice(i, j + 1)); } catch { fail(); } i = j + 1; return v; };
  const scalar = () => {
    const w = ['true', 'false', 'null'].find(x => text.startsWith(x, i));
    if (w) { i += w.length; return; }
    const re = /-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/y;
    re.lastIndex = i;
    const m = re.exec(text);
    if (!m || !m[0].length) fail();
    i += m[0].length;
  };
  const stack = [], spans = new Map();
  let count = null, topObject = false, messagesArray = false;
  const keyIs = (f, k) => !!f && f.obj && f.key === k;
  ws();
  let valueNext = true;
  for (;;) {
    if (!valueNext) {
      ws();
      const f = stack[stack.length - 1];
      if (!f) break;
      let closed = false;
      if (f.obj) {
        if (text[i] === '}' && (!f.wantKey || f.first)) { i++; closed = true; }
        else if (text[i] === ',' && !f.wantKey) { i++; f.wantKey = true; }
        else if (text[i] === '"' && f.wantKey) { const k = str(); if (f.keys.has(k)) fail(); f.keys.add(k); f.key = k; ws(); if (text[i] !== ':') fail(); i++; f.wantKey = false; f.first = false; valueNext = true; }
        else fail();
      } else if (text[i] === ']') { i++; closed = true; }
      else if (text[i] === ',' && !f.first) { i++; f.n++; valueNext = true; }
      else if (f.first) { f.first = false; f.any = true; valueNext = true; }
      else fail();
      if (closed) {
        const done = stack.pop();
        if (stack.length === 1 && keyIs(stack[0], 'messages') && count === null) count = done.any ? done.n + 1 : 0;
        if (stack.length === 3 && keyIs(stack[0], 'messages') && keyIs(stack[2], 'block') && spans.has(stack[1].n)) spans.get(stack[1].n)[1] = i;
      }
      continue;
    }
    valueNext = false;
    ws();
    const depth = stack.length, atBlock = depth === 3 && keyIs(stack[0], 'messages') && stack[1] && !stack[1].obj && keyIs(stack[2], 'block');
    const n = stack[1] && !stack[1].obj ? stack[1].n : 0, start = i;
    const c = text[i];
    if (c === '{') { if (depth === 0) topObject = true; i++; stack.push({ obj: true, keys: new Set(), key: null, wantKey: true, first: true }); }
    else if (c === '[') { if (depth === 1 && keyIs(stack[0], 'messages')) messagesArray = true; i++; stack.push({ obj: false, n: 0, any: false, first: true }); }
    else if (c === '"') str();
    else if (c === undefined) fail();
    else scalar();
    if (atBlock) spans.set(n, [start, i]);
    if (depth === 0 && !stack.length) break;
  }
  ws(); if (i !== text.length) fail();
  if (!topObject || !messagesArray) throw argError('a push is { messages, for }');
  return Array.from({ length: count || 0 }, (_, k) => (spans.has(k) ? strictText(text.slice(spans.get(k)[0], spans.get(k)[1])) : []));
}

// ================================================================ blocks held, causal past (blocks.md)
// A block's causes: every block it names in refs, and the block it counts to (protocol.json causal_state).
const refIds = b => { const out = []; for (const v of Object.values(b.refs || {})) for (const x of asList(v)) if (isStr(x)) out.push(x); for (const k of P.causal_state) if (b.state && isStr(b.state[k])) out.push(b.state[k]); return out; };
// What a block rests on (protocol.json needs): its prev and, by type, the grant it passes on, the offer it answers or stops, the grant it acts under,
// the block it counts to. A block waits until all are held, and a fold reads only blocks whose needs are all in what it reads (dropIllFormed, below).
function needsOf(b) {
  const out = [];
  for (const path of [...P.needs.every, ...(P.needs[b.type] || [])]) {
    const [side, key] = path.split('.');
    const v = b[side] && b[side][key];
    for (const x of asList(v)) if (isStr(x) && x !== '' && !out.includes(x)) out.push(x);
  }
  return out.sort(); // nodes.md, Push: needs ascending
}
const unmetIn = (b, m) => needsOf(b).filter(h => !m.has(h));
function closeMap(m) {
  for (;;) {
    const gone = [...m.values()].filter(b => unmetIn(b, m).length);
    if (!gone.length) return m;
    for (const b of gone) m.delete(b.hash);
  }
}
// A fold reads the largest part of its input in which every block passes the write check (folds.md; core.md section 8, check(block,
// held)) against that part, with its schemas as the schema store, and holds every block it needs. A sealed block held by its public
// header alone (no type) has no body to check.
function dropIllFormed(m) {
  for (;;) {
    const schemas = [...m.values()].filter(b => b.type === 'thing' && b.state.kind === 'schema');
    const tmp = new Pool([...m.values()], true);
    // checks 6 and 7, on what each block rests on (core.md, section 8): a block no node would take counts for nothing in a fold
    const sound = b => {
      if (b.type === 'actor' && (b.refs.author === undefined || 'public_key_sign' in b.state)) return soundGenesis(b) && hashOfBlock(blockOnly(b), b.state.suite || 'std') === b.hash;
      if (!isStr(b.refs.author)) return true;
      return !!signerFrom(b, tmp) && signatureFindings(b, tmp) === null;
    };
    const gone = [...m.values()].filter(b => b.type !== undefined && (check(blockOnly(b), m, schemas).length || !sound(b)));
    for (const b of gone) m.delete(b.hash);
    const before = m.size;
    closeMap(m);
    if (!gone.length && m.size === before) return m;
  }
}
class Pool {
  constructor(blocks, open) { this.m = new Map(); for (const b of blocks || []) if (b && b.hash && isObj(b.state) && isObj(b.refs)) this.m.set(b.hash, b); /* a block whose state or refs is not an object is not read */ if (!open) dropIllFormed(this.m); this.memo = new Map(); this.folds = new Map(); }
  get(h) { return this.m.get(h); }
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
  forget() { this.folds = new Map(); this.memo = new Map(); this._eq = null; } // what the last round took is held now: no fold read before it stays
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
// The suite a block shows by itself: a genesis names its own; any other block is hashed as its prev is (a bare hash is SHA-256, which std names).
function suiteFromBlock(b) {
  if (b.type === 'actor' && b.refs && b.refs.author === undefined) return SUITES.includes(b.state && b.state.suite) ? b.state.suite : 'std';
  const prev = b.refs && b.refs.prev;
  return isStr(prev) && prev.startsWith('sm3:') ? 'sm' : 'std';
}
// The suite of the key that signed a block: a genesis's own; else its author's key that opens it, or the recovery key. null when none does.
function signedSuite(b, pool) {
  if (b.type === 'actor' && b.refs && b.refs.author === undefined) return suiteFromBlock(b);
  if (!isStr(b.refs && b.refs.author)) return null;
  // read from what the block rests on (its prev, the key's chain, the genesis), as check 6 reads it: never from whether the key still speaks
  const s = signerFrom(b, pool);
  if (s) return s.suite;
  const idf = identityFold(b.refs.author, pool);
  if (!idf.keyMap.size) return null;
  for (const k of [idf.genKey, ...idf.keyMap.keys()]) if (isStr(b.signature) && verifyBlock(b, b.signature, k)) return suiteOfKey(k) || 'std';
  const g = pool.get(b.refs.author);
  if (b.state && idf.recoveryOk(b.state.recovery_key) && isStr(b.signature) && verifyBlock(b, b.signature, b.state.recovery_key)) return (g && g.state.recovery_suite) || idf.idSuite;
  return null;
}
// A block's id: the hash of its canonical bytes in the suite of the key that signed it, read among held; else in the suite the block shows.
function idOf(b, held) {
  const suite = (held ? signedSuite(b, poolOf(held)) : null) || suiteFromBlock(b);
  return hashOfBlock(blockOnly(b), suite);
}

// ================================================================ who signed a block, read from what it rests on alone (core.md, checks 6 and 7)
// A genesis that opens with its own key.
const soundGenesis = g => !!g && g.type === 'actor' && g.refs.author === undefined && isStr(g.state.public_key_sign) && g.state.seq === undefined && isStr(g.signature) && verifyBytes(Buffer.from(canonOf(g), 'utf8'), g.signature, g.state.public_key_sign, g.state.suite || 'std');
// Whether a key opens an entry: a whole block's signature, or a sealed header's (privacy.md).
const entryOpens = (e, key, suite) => e.type === undefined && e.signature === undefined
  ? isStr(e.header_signature) && verifyBytes(Buffer.from(jcs(header(e)), 'utf8'), e.header_signature, key)
  : isStr(e.signature) && verifyBytes(Buffer.from(canonOf(e), 'utf8'), e.signature, key, suite);
// autonomous(id, pool): an autonomous system is an actor of kind agent or machine; with `operated`, also any actor an operator answers for (identity.md, consent.md)
const autonomous = (id, pool, operated = false) => { const g = pool.get(id); return (!!g && ['agent', 'machine'].includes(g.state.kind)) || (operated && isStr(id) && operatorsOf(id, pool).length > 0); };
// The key a block brings into an author: the genesis's own; a key grant about the author (subject the author, no status) by the author, or one that
// names in refs.under an operator grant of its own author's that names the author in refs.to (identity.md, Keys). No kind label is read; whether
// that grant stands is the identity fold's to judge.
const operatorGrantUnder = (kg, id, pool) => {
  const g = isStr(kg.refs.under) ? pool.get(kg.refs.under) : null;
  return g && g.type === 'grant' && g.state.kind === 'operator' && g.refs.to === id && g.refs.subject === undefined && g.state.status === undefined && isStr(g.refs.author) && g.refs.author === kg.refs.author ? g : null;
};
function broughtKey(p, author, pool) {
  if (p.hash === author) return soundGenesis(p) ? { key: p.state.public_key_sign, suite: p.state.suite || 'std' } : null;
  const byAuthor = p.refs.author === author || !!operatorGrantUnder(p, author, pool);
  if (p.type === 'grant' && p.state.kind === 'key' && p.refs.subject === author && p.state.status === undefined && byAuthor && isStr(p.state.public_key_sign)) return { key: p.state.public_key_sign, suite: p.state.suite || 'std' };
  return null;
}
// The signer of a block: { key, suite, recovery, first } read from its prev, through it the key's chain back to the block that brought the key in,
// and the author's genesis; null when no such key opens it. `first`: its prev brought the key in.
function signerFrom(b, pool) {
  // a block whose state or refs is not an object is refused by its bytes (core.md, check 1) and has no signer to read
  if (!isObj(b.state) || !isObj(b.refs)) return null;
  const author = b.refs.author, root = isStr(author) ? pool.get(author) : undefined;
  if (!soundGenesis(root)) return null;
  pool.signers = pool.signers || new Map();
  const chain = [b];
  let below = null;
  for (;;) {
    const top = chain[chain.length - 1], p = isStr(top.refs.prev) ? pool.get(top.refs.prev) : undefined;
    if (!p || p.refs.author !== author || chain.includes(p)) break;
    if (pool.signers.has(p.hash) && pool.get(p.hash) === p) { below = pool.signers.get(p.hash); break; }
    chain.push(p);
  }
  let out = null;
  for (let i = chain.length - 1; i >= 0; i--) {
    out = signerStep(chain[i], author, root, pool, below);
    if (pool.get(chain[i].hash) === chain[i]) pool.signers.set(chain[i].hash, out);
    below = out;
  }
  return out;
}
function signerStep(x, author, root, pool, below) {
  const p = isStr(x.refs.prev) ? pool.get(x.refs.prev) : undefined;
  if (!p) return null;
  const seq = x.state.seq, skip = x.state.skip === true;
  const fitsFirst = seq === 1 || (skip && Number.isInteger(seq) && seq >= 1);
  const fitsNext = Number.isInteger(seq) && Number.isInteger(p.state.seq) && (skip ? seq > p.state.seq : seq === p.state.seq + 1);
  if (x.type !== undefined && isStr(x.state.recovery_key) && root.state.recovery_key_hash !== undefined && recoveryKeyHash(x.state.recovery_key, root.state.suite || 'std') === root.state.recovery_key_hash) {
    const rsuite = root.state.recovery_suite || root.state.suite || 'std';
    if (entryOpens(x, x.state.recovery_key, rsuite)) {
      if (x.refs.prev === author) return { key: x.state.recovery_key, suite: rsuite, recovery: true, first: true };
      if (below && below.recovery && below.key === x.state.recovery_key) return { key: x.state.recovery_key, suite: rsuite, recovery: true, first: false };
    }
  }
  const next = below && !below.recovery && entryOpens(x, below.key, below.suite) ? below : null;
  const br = broughtKey(p, author, pool), brought = br && entryOpens(x, br.key, br.suite) ? br : null;
  if (next && fitsNext) return { key: next.key, suite: next.suite, recovery: false, first: false };
  if (brought && fitsFirst) return { key: brought.key, suite: brought.suite, recovery: false, first: true };
  if (next) return { key: next.key, suite: next.suite, recovery: false, first: false };
  if (brought) return { key: brought.key, suite: brought.suite, recovery: false, first: true };
  return null;
}
// The place a block takes in its key's chain: its prev, or the key's root for the key's first block (two first blocks of one key are a pair).
const chainSlot = (b, s) => (s && s.first ? '^first' : b.refs.prev);
// whether a block's seq follows its prev: a key's first block has seq 1, any other the prev's plus one; a skip only goes higher (core.md, invariant 3)
const seqFits = (st, prev, first) => (first ? (st.skip === true ? st.seq >= 1 : st.seq === 1) : (st.skip === true ? st.seq > prev.state.seq : st.seq === prev.state.seq + 1));
// Checks 6 and 7 for a block that is not a genesis, on what it rests on alone. Whether its key still speaks is the folds' (folds.md).
function signatureFindings(block, pool) {
  const b = blockOnly(block), st = b.state, refs = b.refs, sig = block.signature;
  const own = { ...b, hash: block.hash, signature: sig, ...(block.header_signature !== undefined ? { header_signature: block.header_signature } : {}) };
  const root = pool.get(refs.author);
  const hashIs = suite => block.hash === undefined || hashOfBlock(b, suite) === block.hash;
  const w6 = [];
  if (!soundGenesis(root)) {
    if (!hashIs(suiteFromBlock(b))) w6.push({ code: 'bad_hash', detail: 'the id is not the hash of the canonical bytes' });
    w6.push({ code: 'bad_signature', detail: 'the author\'s genesis is not held' });
    return { stage: 6, findings: w6 };
  }
  const s = signerFrom(own, pool);
  if (!s) {
    if (!hashIs(suiteFromBlock(b))) w6.push({ code: 'bad_hash', detail: 'the id is not the hash of the canonical bytes' });
    // "a key of its author" is one that what the block rests on brings in (its needs, and theirs in turn): never a key another held block brings in
    const keys = [], seen = new Set(), todo = needsOf(b);
    while (todo.length) { const h = todo.pop(); if (seen.has(h)) continue; seen.add(h); const p = pool.get(h); if (!p) continue; const k = broughtKey(p, refs.author, pool); if (k) keys.push(k.key); for (const n of needsOf(p)) if (!seen.has(n)) todo.push(n); }
    const anyKey = keys.some(k => isStr(k) && isStr(sig) && verifyBlock(b, sig, k));
    if (anyKey) return { stage: 7, findings: [{ code: 'chain', detail: 'prev does not name the key\'s previous block or the block that brought the key in' }] };
    w6.push({ code: 'bad_signature', detail: 'no key of the author that what it rests on brought in opens it' });
    return { stage: 6, findings: w6 };
  }
  if (!hashIs(s.suite)) w6.push({ code: 'bad_hash', detail: 'the id is not the hash of the canonical bytes in its key\'s suite' });
  if (s.recovery && !(isKeyGrant(b) || recoveryDefeatsOk(b, pool))) w6.push({ code: 'recovery_scope', detail: 'the recovery key signs only key grants and the defeats a profile gives it' });
  // an author's own key grant that replaces a key is signed by that key or the recovery key; one an operator signs is the identity fold's to judge
  if (isKeyGrant(b) && st.replaces !== undefined && !s.recovery && refs.subject === refs.author && st.replaces !== s.key) w6.push({ code: 'not_own_rotation', detail: 'a key is rotated only by itself, by the recovery key, or by its operator' });
  if (w6.length) return { stage: 6, findings: w6 };
  if (!seqFits(st, pool.get(refs.prev), s.first)) return { stage: 7, findings: [{ code: 'chain', detail: s.first ? 'a key\'s first block has seq 1' : 'seq does not follow prev' }] };
  return null;
}

// ================================================================ the identity fold (identity.md)
// Output: signed_by_author { hash: bool }, keys, frozen (sorted), operators, plus the working data valid() needs.
const isKeyGrant = b => b.type === 'grant' && b.state && b.state.kind === 'key';
// the one observe besides key grants a recovery key signs (profiles/successor.md): a defeats naming, in refs.under, a successor grant its author gave.
// Judged on what it rests on (the grant is a need, the blocks it defeats are not): a target that is no trigger under the grant cancels nothing in the fold
function recoveryDefeatsOk(b, pool) {
  const g = isStr(b.refs.under) ? pool.get(b.refs.under) : undefined;
  return b.type === 'observe' && !!g && g.type === 'grant' && g.state.kind === 'successor' && g.state.status === undefined && g.refs.author === b.refs.author &&
    asList(b.refs.defeats).length > 0;
}
function emptyIdentity() { return { signed_by_author: {}, keys: [], frozen: [], info: new Map(), keyMap: new Map(), timeline: [], rotations: [] }; }
function identityFold(id, poolIn, visiting, arrivals) {
  const pool = poolOf(poolIn);
  // with the reader's arrivals, the view of recovery reach (identity.md): read afresh, never remembered beside the pure fold
  if (arrivals) return computeIdentity(id, pool, new Set([id]), false, arrivals);
  if (pool.folds.has(id)) return pool.folds.get(id);
  visiting = visiting || new Set();
  if (visiting.has(id)) return emptyIdentity();
  visiting.add(id);
  // a pool read for a view that applies the reader's arrivals (ownership_view, promise_view with arrivals: decision c9) reads every identity so
  const res = computeIdentity(id, pool, visiting, false, pool.arrivals || undefined);
  visiting.delete(id);
  pool.folds.set(id, res);
  return res;
}
// an operator's identity as the operator route reads it: without the operator's own operators (so no loop), cached apart
function plainIdentityFold(id, pool) {
  const k = 'plain:' + id;
  if (!pool.folds.has(k)) pool.folds.set(k, computeIdentity(id, pool, new Set([id]), true));
  return pool.folds.get(k);
}
function computeIdentity(id, pool, visiting, plain, arrivals) {
  const g = pool.get(id);
  if (!g || g.type !== 'actor' || g.refs.author !== undefined || !isStr(g.state.public_key_sign)) return emptyIdentity();
  const genKey = g.state.public_key_sign;
  const idSuite = g.state.suite || 'std';
  const all = pool.all();
  const authored = all.filter(b => b.refs.author === id && b.hash !== id);
  // a key grant about the identity, with no status (a block with a status is a stop or an answer, never a grant: authority.md)
  const grantsFor = all.filter(b => isKeyGrant(b) && b.refs.subject === id && b.state.status === undefined);
  const opCandidates = grantsFor.filter(b => b.refs.author !== id);
  const claim = new Set([genKey]);
  for (const b of grantsFor) if (isStr(b.state.public_key_sign)) claim.add(b.state.public_key_sign);
  // the recovery key hash: the genesis names it, and nothing else may (identity.md, The recovery key)
  const rh = g.state.recovery_key_hash;
  const recoveryOk = rk => isStr(rk) && rh !== undefined && recoveryKeyHash(rk, idSuite) === rh;
  const info = new Map();
  for (const b of authored) {
    if (b.state.recovery_key !== undefined && recoveryOk(b.state.recovery_key) && verifyBlock(b, b.signature, b.state.recovery_key)) { info.set(b.hash, { key: b.state.recovery_key, role: 'recovery' }); continue; }
    for (const k of claim) if (verifyBlock(b, b.signature, k)) { info.set(b.hash, { key: k, role: 'key' }); break; }
  }
  const order = [...authored, ...opCandidates].sort((a, b) => pool.past(a.hash).size - pool.past(b.hash).size || (a.state.seq || 0) - (b.state.seq || 0) || byHash(a, b));
  // a rotated key's counted line (identity.md, Rotation): counted_to and every block reached from it by prev while each is a block of this id that
  // the old key signed (a rotation's counted_to is held: it is one of the blocks the rotation rests on). A sibling off the line is not on it.
  const lineOf = (R, ct) => {
    const out = new Set();
    for (let h = ct; isStr(h) && h !== id && !out.has(h);) {
      const c = pool.get(h), ci = c && info.get(h);
      if (!c || !ci || ci.key !== R || ci.role !== 'key') break;
      out.add(h); h = c.refs.prev;
    }
    return out;
  };
  const isAgentLike = !plain;
  const opAuthorized = b => {
    if (!isAgentLike || visiting.has(b.refs.author)) return false;
    const O = b.refs.author;
    // the operator as this key grant sees it: a death ends the operator grant only for blocks that see the close (authority.md, Ending)
    const og = operatorGrantUnder(b, id, pool);
    if (!og || !operatorsOf(id, pool, b, og.hash).includes(O)) return false;
    // the one exception to "a stop cuts where it was signed": a stop or decline of the operator grant that does not see this key grant cuts it too
    // (read by signatures alone, as the machine's accept is)
    if (ended(og, pool, u => plainIdentityFold(u.refs.author, pool).signed_by_author[u.hash] === true && !pool.past(u.hash).has(b.hash))) return false;
    const of = plainIdentityFold(O, pool);
    return of.signed_by_author[b.hash] === true;
  };
  // recovery reach (a view, identity.md): with the reader's arrivals, a recovery rotation of X cannot void a block another identity built on that
  // arrived before the reach began (the latest recovery rotation's arrival, less recovery_reach). Without arrivals, nothing is reached.
  let floors = {};
  // a block of another identity holds b in its causal past: it built on b (decision C1, n3)
  const builtOnByOther = b => pool.all().some(o => isStr(o.refs.author) && o.refs.author !== id && o.hash !== b.hash && pool.sees(o.hash, b.hash));
  const reached = (b, X) => {
    const floor = floors[X];
    if (!arrivals || !floor) return false;
    const at = arrivals[b.hash];
    // a block whose arrival the reader does not know is read as the reader chose (identity.md, Recovery reach)
    return (isStr(at) && at !== '' ? at < floor : arrivals.__outside === true) && builtOnByOther(b);
  };
  // one pass: which blocks count, given the counted lines and frozen keys assumed
  const pass = (lines, frozen, settled) => {
    const keys = new Map([[genKey, { via: null }]]), counting = new Set([id]), brings = new Map(), rotations = [];
    for (const b of order) {
      const inf = info.get(b.hash);
      let ok = false, permitted = true, role;
      if (b.refs.author !== id) { // the operator route
        if (isKeyGrant(b) && opAuthorized(b)) { ok = true; role = 'operator'; } else continue;
      } else if (!inf) continue;
      else if (inf.role === 'recovery') { if (!(isKeyGrant(b) || recoveryDefeatsOk(b, pool))) continue; ok = true; role = 'recovery'; }
      else {
        role = 'key';
        const X = inf.key;
        // a key grant with scope.until brings its key in until then (decision H11): the key speaks for no block dated at or after it, or with no date
        const via = keys.has(X) ? keys.get(X).via : null;
        if (via && ranOut(via, b)) continue;
        if (keys.has(X) && !frozen.has(X)) {
          // the rotation itself stands, unless another rotation of that key is in its causal past: the old key's speech ended at the first
          // (with a recovery rotation of the key, the recovery key settles which of its blocks count: its line alone)
          const self = isKeyGrant(b) && b.refs.subject === id && b.state.status === undefined && b.state.replaces === X && !settled.has(X) && !rotations.some(r => r.R === X && pool.sees(b.hash, r.b.hash));
          // a key's own rotation (or its operator's) only closes its future (decision C1): a block of the old key is void once a rotation of the key
          // is in its causal past, whatever counted_to says; only the recovery key reaches back, by its line
          const L = lines[X];
          ok = self || L === undefined || (L instanceof Set ? L.has(b.hash) || reached(b, X) : !L.after.some(r => r !== b.hash && pool.sees(b.hash, r)));
        } else if (keys.has(X) && frozen.has(X)) {
          // a crossing never erases what someone else built on (decision C1, n3): a block of a frozen key, unsettled by a recovery rotation, speaks
          // when a block of another author holds it in its causal past; a key grant is no such block (a frozen key brings in no key)
          const via = keys.get(X).via, froze = via ? (via.state.replaces !== undefined ? via.state.replaces : (info.get(via.hash) || {}).key) : undefined;
          ok = !isKeyGrant(b) && !(froze !== undefined && settled.has(froze)) && builtOnByOther(b);
        }
      }
      if (!ok) continue;
      const own = isKeyGrant(b) && b.refs.subject === id && b.state.status === undefined; // a key grant about another identity brings no key in here
      if (own && b.state.replaces !== undefined) {
        const R = b.state.replaces;
        permitted = role === 'recovery' || role === 'operator' || (info.get(b.hash) && info.get(b.hash).key === R);
        if (b.refs.author === id) counting.add(b.hash);
        if (!permitted) continue;
        rotations.push({ b, R, role, line: lineOf(R, b.state.counted_to) });
      } else if (b.refs.author === id) counting.add(b.hash);
      if (own && isStr(b.state.public_key_sign) && permitted) { if (!keys.has(b.state.public_key_sign)) keys.set(b.state.public_key_sign, { via: b }); brings.set(b.hash, b.state.public_key_sign); }
    }
    return { keys, counting, brings, rotations };
  };
  let lines = {}, frozen = new Set(), settled = new Set(), identityEnded = false, st;
  const unrelated = (a, b) => !pool.sees(a.hash, b.hash) && !pool.sees(b.hash, a.hash);
  const linesKey = l => JSON.stringify(Object.keys(l).sort().map(k => [k, l[k] instanceof Set ? [...l[k]].sort() : l[k]]));
  for (let it = 0; it < 16; it++) {
    st = pass(lines, frozen, settled);
    const nc = {}, nf = new Set(), ns = new Set(), nf2 = {};
    const byR = new Map();
    for (const r of st.rotations) { if (!byR.has(r.R)) byR.set(r.R, []); byR.get(r.R).push(r); }
    for (const [R, list] of byR) {
      // a recovery rotation settles it: the latest recovery rotation's line (the one that has every other recovery rotation of the key in its
      // causal past); with none (recovery rotations that cross, which end the identity), every block either counts: no rotation un-counts a
      // block another counted (identity.md, Conflict), and the end keeps only their causal pasts
      const rec = list.filter(r => r.role === 'recovery');
      const last = rec.find(r => rec.every(o => o === r || pool.sees(r.b.hash, o.b.hash)));
      // else every block a standing rotation counts: no rotation un-counts a block another counted (identity.md, Conflict)
      nc[R] = rec.length ? (last ? last.line : new Set(rec.flatMap(r => [...r.line]))) : { after: list.map(r => r.b.hash).sort() };
      if (last && arrivals && isStr(arrivals[last.b.hash]) && isStr(g.state.recovery_reach)) nf2[R] = addDur(arrivals[last.b.hash], g.state.recovery_reach, -1);
      if (rec.length) ns.add(R);
    }
    // conflicts: two counting key grants of one key naming one prev, or two rotations of one key that do not see each other
    // an operator's rotation of the machine's key is a rotation of that key like any other (identity.md, Conflict)
    const grants = order.filter(b => isKeyGrant(b) && (st.counting.has(b.hash) || st.rotations.some(r => r.b === b && r.role === 'operator')));
    const pairs = [];
    for (let i = 0; i < grants.length; i++) for (let j = i + 1; j < grants.length; j++) {
      const a = grants[i], c = grants[j], ia = info.get(a.hash), ic = info.get(c.hash);
      // a pair of the identity's own key grants (refs.subject the id): a key grant about another identity brings no key in here
      const forkPair = ia && ic && ia.key === ic.key && a.refs.prev === c.refs.prev && a.refs.subject === id && c.refs.subject === id;
      const rotPair = a.state.replaces !== undefined && a.state.replaces === c.state.replaces && unrelated(a, c) && st.rotations.some(r => r.b === a) && st.rotations.some(r => r.b === c);
      if (forkPair || rotPair) pairs.push([a, c, rotPair ? a.state.replaces : ia.key]);
    }
    const rrots = st.rotations.filter(r => r.role === 'recovery');
    identityEnded = false;
    for (let i = 0; i < rrots.length; i++) for (let j = i + 1; j < rrots.length; j++) if (unrelated(rrots[i].b, rrots[j].b)) identityEnded = true;
    for (const [a, c, R] of pairs) {
      const rr = rrots.filter(r => r.R === R);
      for (const m of [a, c]) {
        const S = m.state.public_key_sign;
        if (!isStr(S)) continue;
        const settled = rr.some(r => pool.sees(r.b.hash, m.hash) || r.b.state.counted_to === m.hash);
        if (!settled) nf.add(S);
      }
    }
    const floorsSame = JSON.stringify(nf2) === JSON.stringify(floors);
    if (floorsSame && linesKey(nc) === linesKey(lines) && [...nf].sort().join() === [...frozen].sort().join() && [...ns].sort().join() === [...settled].sort().join()) break;
    lines = nc; frozen = nf; settled = ns; floors = nf2;
  }
  let counting = st.counting;
  if (identityEnded) { // two recovery rotations that do not see each other end the identity: only the causal past of either stands
    const rrots = st.rotations.filter(r => r.role === 'recovery'), keep = new Set([id]);
    for (const r of rrots) { keep.add(r.b.hash); for (const h of pool.past(r.b.hash)) keep.add(h); }
    counting = new Set([...counting].filter(h => keep.has(h)));
  }
  const sba = { [id]: true };
  for (const b of authored) sba[b.hash] = counting.has(b.hash);
  const keyList = [...st.keys.keys()];
  const timeline = [];
  // each key with the block that brought it in (`by`: the genesis, or the key grant), and the key that signed that block (`signer`: null for the
  // genesis key, "recovery" for the recovery key, "operator" for an operator's key grant). A void key is not among the keys (identity.md), so every
  // key listed has `void` false.
  const signerOf = b => { if (!b) return null; if (b.refs.author !== id) return 'operator'; const inf = info.get(b.hash); return inf.role === 'recovery' ? 'recovery' : inf.key; };
  for (const k of keyList) { const via = st.keys.get(k).via; timeline.push({ key: k, by: via ? via.hash : id, signer: signerOf(via), frozen: frozen.has(k), suite: suiteOfKey(k) || 'std' }); }
  return { signed_by_author: sba, keys: keyList.slice().sort(), frozen: [...frozen].filter(k => st.keys.has(k)).sort(), info, keyMap: st.keys, timeline, rotations: st.rotations, recoveryOk, genKey, idSuite };
}
// The operators of an autonomous system or machine: authors of live grants of kind operator naming it in refs.to and no subject (a grant with a subject appoints an operator of a thing).
// relying: a block that rests on the operator grant (a key grant the operator signed); a close counts only when it is in that block's past
function operatorsOf(id, poolIn, relying, only) {
  const pool = poolOf(poolIn);
  const out = new Set(), all = () => true, seenBy = pool.seenBy(relying);
  for (const gr of pool.all()) {
    // a block with a status is a stop or an answer, never a grant (authority.md), whatever else it restates
    if (gr.type !== 'grant' || gr.state.kind !== 'operator' || gr.state.status !== undefined || gr.refs.to !== id || gr.refs.subject !== undefined || !isStr(gr.refs.author)) continue;
    if (only !== undefined && gr.hash !== only) continue;
    const O = gr.refs.author;
    if (O === id) continue;
    const of = plainIdentityFold(O, pool);
    if (of.signed_by_author[gr.hash] !== true) continue;
    // it stands unless its author stopped it, its receiver ended it, or its author died by a close that does not carry it on (authority.md, Ending),
    // read by signatures alone: judging forks would need this very fold
    // the machine consents (identity.md): its own accepted answer to the grant, seen by the block that relies on it
    // the machine's own word: its accept signed by a key that speaks for it (read without its operators, so no loop)
    const accepted = pool.all().some(a => a.type === 'grant' && a.state.status === 'accepted' && a.refs.answers === gr.hash && a.refs.author === id && seenBy(a.hash) && plainIdentityFold(id, pool).signed_by_author[a.hash] === true);
    // an operator grant with scope.until answers for the machine until then (decision H11): a relying block dated at or after it, or with no date, has no operator by it
    if (accepted && !(relying && ranOut(gr, relying)) && !ended(gr, pool, all, seenBy) && !closedBy(O, [gr.hash], pool, seenBy, all)) out.add(O);
  }
  return [...out].sort();
}
// The recovery_reach view: the voided blocks the reach protects (identity.md). arrivals: { hash: time } or null.
function recoveryReachView(rotation, blocks, arrivals) { // arrivals read by reachArrivals
  // the blocks of a recovery rotation's identity that the fold voids and the reader's arrivals restore (identity.md, Recovery reach): a block the
  // reach protects, and what a protected key grant brought in. Asked about any other block, nothing.
  const pool = poolOf([...poolOf(blocks).all(), rotation]);
  const id = rotation.refs && rotation.refs.author;
  if (!arrivals || !isStr(id)) return [];
  const pure = identityFold(id, pool);
  const r = pool.get(rotation.hash);
  if (!r || !pure.info.get(r.hash) || pure.info.get(r.hash).role !== 'recovery' || !isKeyGrant(r) || r.state.replaces === undefined) return [];
  const viewed = identityFold(id, pool, null, arrivals);
  return Object.keys(pure.signed_by_author).filter(h => h !== r.hash && pure.signed_by_author[h] === false && viewed.signed_by_author[h] === true).sort();
}

// ================================================================ valid(block, context)  (core.md section 8)
// block: { hash?, type, state, refs, signature, suite? }; context: the blocks held (array, Map or Pool). Returns refusals [{ code, detail }].
function uniqueCodes(list) { const seen = new Set(), out = []; for (const f of list) if (!seen.has(f.code)) { seen.add(f.code); out.push({ code: f.code, detail: f.detail || '' }); } return out; }
function validStages(block, poolIn, schemasIn) {
  const pool = poolOf(poolIn);
  const b = blockOnly(block);
  const ctx = { held: pool.m, noClosed: true };
  // checks 1 to 4: the bytes, the values, the size, the genesis or the common five
  const early = contentFindings(b, ctx);
  if (early.length) { const stage = Math.min(...early.map(f => f.stage)); return { stage, findings: early.filter(f => f.stage === stage) }; }
  const found = (stage, list) => ({ stage, findings: list });
  // check 5: what the block rests on. A block that rests on blocks not held is not judged: a node waits for them.
  const missing = unmetIn(b, pool.m);
  if (missing.length) return found(5, [{ code: 'unmet', detail: 'rests on blocks not held: ' + missing.join(', ') }]);
  // check 6: the id sent, the signing key and the signature
  const w6 = [];
  const sig = block.signature;
  const type = b.type, st = b.state, refs = b.refs;
  const genesis = type === 'actor' && (refs.author === undefined || 'public_key_sign' in st);
  let signerKey, signerSuite, role = 'key', idf = null;
  if (genesis) {
    signerKey = st.public_key_sign;
    if (!isStr(sig) || !verifyBlock(b, sig, signerKey)) w6.push({ code: 'bad_genesis', detail: 'a genesis is signed by its own key' });
    signerSuite = suiteOfKey(signerKey) || 'std';
  } else {
    const r = signatureFindings(block, pool);
    if (r) return found(r.stage, r.findings);
    role = signerFrom({ ...b, hash: block.hash, signature: sig }, pool).recovery ? 'recovery' : 'key';
  }
  // core.md section 8 lists `bad_hash` with the key and signature codes: the id is the hash of the bytes in the suite of the key that signed it
  if (genesis && block.hash !== undefined && hashOfBlock(b, signerSuite !== undefined ? signerSuite : suiteFromBlock(b)) !== block.hash) w6.push({ code: 'bad_hash', detail: 'the id is not the hash of the canonical bytes in its key\'s suite' });
  if (w6.length) return found(6, w6);
  // check 8: a closed type's required fields, undeclared fields and its module's checks
  const late = [];
  if (CLOSED.has(type) && !genesis) closedFindings(b, { held: pool.m, schemas: Array.isArray(schemasIn) ? normHeld(schemasIn) : null, recoverySigned: role === 'recovery' }, (stage, code, detail) => late.push({ stage, code, detail }));
  if (late.length) return found(8, late);
  return { stage: 0, findings: [] };
}
function valid(block, context, schemas) { return inCodeOrder(validStages(block, context, schemas).findings); }

// ================================================================ the compact form (encoding.md, CBOR)
// A public block as CBOR (RFC 8949). The id is always the hash of the canonical JSON. Writing is deterministic; a reader refuses
// indefinite lengths, floats, tags, null, undefined, duplicate keys and integers outside +-(2^53 - 1).
const CB = P.cbor, MAXBI = BigInt(P.integers.max);
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
    if (depth > P.limits.depth_read) throw new Error('cbor: too deep');
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
    if (n in out) throw new Error('cbor: duplicate key');
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
  const val = (k, x) => k === 'seq' ? { int: BigInt(x) } : k === 'withheld' ? { bool: x } : RX.hash.test(x) ? { bytes: Buffer.from(x, 'hex') } : { text: x };
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
  // not yet known to the fold (e.g. a block outside the pool): try the keys the identity names
  for (const k of idf.keyMap.keys()) if (verifyBlock(b, b.signature, k)) return k;
  // the recovery key is a signer of its own (identity.md): its first block names the genesis as the first key's does, and the two are not a pair
  if (b.state && idf.recoveryOk && idf.recoveryOk(b.state.recovery_key) && verifyBlock(b, b.signature, b.state.recovery_key)) return b.state.recovery_key;
  return null;
}
// Two blocks of one key that name one prev, both speaking for their author: a block a rotation voided (an old key's sibling off its counted line,
// identity.md, Rotation) forms no pair, and neither does a block whose key cannot be told.
function forkPairs(blocksIn) {
  const pool = poolOf(blocksIn);
  const groups = new Map();
  for (const b of pool.all()) {
    if (!isStr(b.refs.author) || !isStr(b.refs.prev) || b.type === undefined) continue;
    const idf = identityFold(b.refs.author, pool);
    if (!idf.keyMap.size || idf.signed_by_author[b.hash] !== true) continue;
    const key = signerKeyOf(b, pool);
    if (!key) continue;
    // a key's first block takes the key's root: two first blocks of one key are a pair, whichever bringer each names
    const sg = signerFrom(b, pool);
    const k = b.refs.author + '|' + key + '|' + (sg && sg.key === key ? chainSlot(b, sg) : b.refs.prev);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(b.hash);
  }
  return star(groups.values());
}
// the pairs that prove a group of one key's blocks on one prev (nodes.md): a star, each block paired with the group's lowest hash
function star(groups) {
  const pairs = [];
  for (const list of groups) { const g = [...new Set(list)].sort(); for (const x of g.slice(1)) pairs.push([g[0], x]); }
  return pairs.sort((a, b) => cmp(a[0] + a[1], b[0] + b[1]));
}
function equivocated(pool) {
  if (pool._eq) return pool._eq;
  const out = new Set();
  const pairs = forkPairs(pool);
  for (const [a, b] of pairs) {
    const A = pool.get(a), B = pool.get(b), key = signerKeyOf(A, pool) || A.refs.author;
    out.add(a); out.add(b);
    const from = Math.min(A.state.seq || 0, B.state.seq || 0);
    for (const x of pool.all()) if (x.refs.author === A.refs.author && x.hash !== a && x.hash !== b && (signerKeyOf(x, pool) || x.refs.author) === key && (x.state.seq || 0) > from) out.add(x.hash);
  }
  pool._eq = out;
  return out;
}
// whether a rotation or the identity's end voided the block: its key does not speak for its author
function voided(b, pool) { const idf = identityFold(b.refs.author, pool); return idf.keyMap.size > 0 && idf.signed_by_author[b.hash] === false; }
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
  const mine = pool.all().filter(b => b.hash !== broughtIn && Number.isInteger(b.state.seq) && b.state.seq >= 1);
  const own = new Map(mine.map(b => [b.hash, b]));
  const sorted = mine.slice().sort((a, b) => a.state.seq - b.state.seq || byHash(a, b));
  const skip = b => b.state.skip === true;
  // the place each block takes (core.md, invariant 3): its prev, or the key's root for a first block, one naming the block that brought the key
  // in, or, at seq 1, a block that is none of the key's (another block that brought it in): two first blocks of one key are a pair
  const first = b => isStr(b.refs.prev) && (b.refs.prev === broughtIn || (!own.has(b.refs.prev) && b.state.seq === 1));
  const byPrev = new Map();
  for (const b of mine) { const slot = first(b) ? '^first' : b.refs.prev; if (!isStr(slot)) continue; if (!byPrev.has(slot)) byPrev.set(slot, []); byPrev.get(slot).push(b.hash); }
  const pairs = star(byPrev.values());
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
  // broken: the prev does not name the block before, the block that brought the key in at seq 1 (or a skip), or a block of the key one seq lower
  // (any lower, for a skip)
  const broken = mine.filter(b => {
    const p = b.refs.prev;
    if (p === broughtIn) return !(b.state.seq === 1 || skip(b));
    const q = own.get(p);
    if (!q) return true;
    return !(skip(b) ? b.state.seq > q.state.seq : b.state.seq === q.state.seq + 1);
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
const header = b => { const h = { author: b.refs.author, seq: b.state.seq, prev: b.refs.prev, hash: b.hash }; if (b.state.withheld === true) h.withheld = true; if (b.state.skip === true) h.skip = true; return h; };

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

// ---- push admission (nodes.md): a block waits until every block it rests on is held, then is judged once; blocks are judged in rounds
// against the store as it stood when the round began, so the answer never depends on the order of a push; two blocks of one key naming one
// prev are both kept and listed as a pair, and the node's own stated choice (takesPairs) says whether a pair's blocks are taken: if not, neither
// block of a pair that arrives in one round is.
// The key that signed a block as far as the reader can tell: a whole block's signature opens with a key of its author; a sealed block held by its public
// header carries the header's signature. null when it cannot be told. A place in a chain is (author, prev, key); an unknown key rivals any key.
function keyOfEntry(b, pool) {
  if (!isStr(b.refs.author)) return null;
  if (b.type !== undefined) { const s = signerFrom(b, pool); return s ? s.key : signerKeyOf(b, pool); } // the key check 6 reads from what it rests on
  const idf = identityFold(b.refs.author, pool);
  for (const k of idf.keyMap.keys()) if (isStr(b.header_signature) && verifyBytes(Buffer.from(jcs(header(b)), 'utf8'), b.header_signature, k)) return k;
  return null;
}
const placeOf = (b, pool) => {
  if (!isStr(b.refs.author) || !isStr(b.refs.prev)) return null;
  const key = keyOfEntry(b, pool), sg = signerFrom(b, pool);
  return { author: b.refs.author, prev: sg && sg.key === key ? chainSlot(b, sg) : b.refs.prev, key };
};
const samePlace = (a, b) => a.author === b.author && a.prev === b.prev && (a.key === null || b.key === null || a.key === b.key);
// a header held beside the whole block of its hash adds nothing: the body is held, so the block is held (nodes.md, Rounds: a block whose body is
// held is nothing new)
const normaliseHeld = held => {
  const out = (held || []).map(h => (h && h.header && h.type === undefined ? headerEntry(h) : h)).filter(Boolean);
  const whole = new Set(out.filter(h => h.type !== undefined).map(h => h.hash));
  return out.filter(h => h.type !== undefined || !whole.has(h.hash));
};
// inPlace(x, at, pool): x takes the place `at` in a key's chain (author, prev or the key's root, and a key that is the same or unknown)
const inPlace = (x, at, pool) => { const p = x.refs.author === at.author && (at.prev === '^first' || x.refs.prev === at.prev) && placeOf(x, pool); return !!p && samePlace(p, at); };
// pairsAt(g, round, pool, speaks, pairs): whether the block g = { b, at } is one of a pair at its place (nodes.md, Rounds): another block, held or in this round,
// takes the same place and `speaks`. A star: g is paired with the lowest hash of its rivals, and the lowest with each of the others. Writes the pairs.
function pairsAt(g, round, pool, speaks, pairs) {
  if (!g.at) return false;
  const others = [...pool.all().filter(x => x.hash !== g.b.hash && inPlace(x, g.at, pool)).map(x => x.hash), ...round.filter(o => o.b.hash !== g.b.hash && o.at && samePlace(o.at, g.at)).map(o => o.b.hash)];
  if (!others.length || !speaks(g.b.hash)) return false;
  const rivals = others.filter(speaks);
  if (!rivals.length) return false;
  const lowest = rivals.slice().sort()[0];
  for (const o of lowest < g.b.hash ? [lowest] : rivals) pairs.set([o, g.b.hash].sort().join(), [o, g.b.hash].sort());
  return true;
}
// inRounds(pool, pending, ready, judge, speaks, taken, refused): the rounds of a push (nodes.md, Push). Each round takes the `ready` blocks of `pending` (every block
// they rest on held), judges each against the store as it stood, and then holds them: so the answer never depends on the order of a push. Two blocks of one
// key naming one prev are both kept and listed as a pair; neither block of a pair that arrives in one round is taken unless the node chose to take pairs.
function inRounds(pool, pending, ready, judge, speaks, taken, refused, takesPairs, waits = b => unmetIn(b, pool.m).length > 0) {
  const pairs = new Map();
  for (;;) {
    pool.forget();
    const batch = ready(pending);
    if (!batch.length) break;
    pending = pending.filter(b => waits(b));
    const good = [];
    for (const b of batch) {
      const why = judge(b);
      for (const r of why) refused.push({ hash: b.hash, code: r.code, detail: r.detail });
      if (!why.length) good.push({ b, at: placeOf(b, pool) });
    }
    const forked = new Set(good.filter(g => pairsAt(g, good, pool, speaks(good), pairs)).map(g => g.b.hash));
    for (const g of good) { pool.m.set(g.b.hash, g.b); if (takesPairs || !forked.has(g.b.hash)) taken.push(g.b); }
  }
  return { waiting: [...pending].sort(byHash).map(b => ({ hash: b.hash, needs: unmetIn(b, pool.m) })), equivocations: [...pairs.values()].sort((a, b) => cmp(a.join(), b.join())) };
}
function accept(incomingIn, heldIn, takesPairs, schemas) {
  // a sealed header held under the hash of a body that arrives, naming another author, seq or prev, was a lie about that hash (privacy.md):
  // it is read as never held
  const heldAll = poolOf(normaliseHeld(heldIn.all ? heldIn.all() : heldIn)).all();
  const lie = h => h.type === undefined && incomingIn.some(b => b && b.type !== undefined && b.hash === h.hash && (h.refs.author !== b.refs.author || h.state.seq !== b.state.seq || h.refs.prev !== b.refs.prev));
  const lies = new Set(heldAll.filter(lie).map(h => h.hash));
  const pool = new Pool(heldAll.filter(h => !lie(h)));
  const taken = [], refused = [];
  // a block's id is the one a reader that holds its author's keys computes, in the suite of the key that signed it (core.md, section 2); copies of one block
  // (one id, once computed so) are taken once, the lowest signature only to name one; a block whose body is held is nothing new
  // checks 1 to 4 read the bytes alone: a block failing one is refused at once, whatever it lacks (core.md, section 8), so it never waits
  const badBytes = b => b && b.type !== undefined && contentFindings(blockOnly(b), { held: pool.m, noClosed: true }).length > 0;
  const waits = b => unmetIn(b, pool.m).length > 0 && !badBytes(b);
  const ready = pending => pending.filter(b => !waits(b)).map(b => (b.type === undefined ? b : { ...b, hash: idOf(b, pool) }))
    .sort((x, y) => cmp(x.hash, y.hash) || cmp(String(x.signature), String(y.signature))) // inside a round, ascending by hash
    .filter((b, i, all) => (i === 0 || all[i - 1].hash !== b.hash) && (b.type === undefined || !(pool.get(b.hash) && pool.get(b.hash).type !== undefined)));
  // the store once the round is taken: a block the round voids (an old key's sibling off the counted line of a rotation arriving now) forms no pair
  const speaks = good => {
    let after = null;
    return h => { after = after || new Pool([...pool.all(), ...good.map(g => g.b)]); const x = after.get(h); return !!x && (x.type === undefined || identityFold(x.refs.author, after).signed_by_author[h] === true); };
  };
  const { waiting, equivocations } = inRounds(pool, incomingIn.filter(b => b && !(pool.get(b.hash) && pool.get(b.hash).type !== undefined)), ready, b => valid(b, pool, schemas), speaks, taken, refused, takesPairs, waits);
  return { taken, waiting, refused, equivocations, false_headers: taken.map(b => b.hash).filter(h => lies.has(h)).sort() };
}

// A block's causal past through the blocks given (sorted): every block reachable by prev, after and every other ref, and by counted_to.
function pastOfBlock(block, blocks) {
  const pool = new Pool(blocks, true);
  const seen = new Set(), stack = refIds(block);
  for (const h of stack) seen.add(h);
  while (stack.length) { const b = pool.get(stack.pop()); if (!b) continue; for (const r of refIds(b)) if (!seen.has(r)) { seen.add(r); stack.push(r); } }
  return [...seen].sort();
}
// ---- the sealed blocks of a push (privacy.md, Checking a sealed block's link in its chain): the header alone is checked, once the block it names in prev is held.
// A sealed block is held as its public header and signature: a block with no type and no body.
function headerEntry(m) {
  const h = m && m.header;
  if (!isObj(h)) return null;
  const out = { hash: h.hash, state: { seq: h.seq, audience: ['sealed'] }, refs: { author: h.author, prev: h.prev } };
  for (const flag of ['withheld', 'skip']) if (flag in h) out.state[flag] = h[flag];
  if (Object.keys(h).some(k => !['author', 'seq', 'prev', 'hash', 'withheld', 'skip'].includes(k))) out.bad_header = true;
  if (m.header_signature !== undefined) out.header_signature = m.header_signature;
  return out;
}
function acceptSealed(incomingIn, heldIn, takesPairs) {
  const pool = new Pool(normaliseHeld(heldIn));
  const taken = [], refused = [], pending = [];
  for (const m of incomingIn) {
    if (m && m.version !== undefined) { refused.push({ hash: '', code: 'shape', detail: 'a sealed block carries no version: it is { header, header_signature, envelope }' }); continue; }
    const e = headerEntry(m);
    if (!e) { refused.push({ hash: '', code: 'shape', detail: 'a sealed block is { header, header_signature, envelope }' }); continue; }
    const held = pool.get(e.hash);
    if (held && held.type !== undefined) {
      if (held.refs.author === e.refs.author && held.state.seq === e.state.seq && held.refs.prev === e.refs.prev) taken.push(e);
      else refused.push({ hash: e.hash, code: 'bad_hash', detail: 'the header does not describe the block held under this hash' });
    } else if (!held) pending.push(e);
  }
  taken.sort(byHash); refused.sort(byHash); // the first round: the other halves of blocks held
  const judge = e => {
    const st = e.state, refs = e.refs;
    const ok = Number.isInteger(st.seq) && st.seq >= 1 && !idProblem(refs.author) && !idProblem(refs.prev) && !idProblem(e.hash) && ['withheld', 'skip'].every(f => !(f in st) || st[f] === true) && isStr(e.header_signature) && !e.bad_header;
    if (!ok) return [{ code: 'shape', detail: 'a sealed block\'s header is { author, seq, prev, hash } and its signature; withheld and skip only true' }];
    if (!soundGenesis(pool.get(refs.author))) return [{ code: 'bad_signature', detail: 'the author\'s genesis is not held' }];
    const p = pool.get(refs.prev);
    if (!p) return [{ code: 'chain', detail: 'refs.prev is not held' }];
    // the header's signer, read from what it rests on alone, as for a whole block (core.md, checks 6 and 7)
    const sg = signerFrom(e, pool);
    if (!sg) return [{ code: 'bad_signature', detail: 'the header is not signed by a key of its author that what it rests on brought in' }];
    if (!seqFits(st, p, sg.first)) return [{ code: 'chain', detail: sg.first ? 'a key\'s first block has seq 1' : 'seq does not follow prev' }];
    return [];
  };
  // a header speaks for nothing to read: every rival stands
  const { waiting, equivocations } = inRounds(pool, pending, pend => pend.filter(b => !unmetIn(b, pool.m).length).sort(byHash), judge, () => () => true, taken, refused, takesPairs);
  return { taken, waiting, refused, equivocations };
}

// ================================================================ authority (authority.md)
const actNames = b => isStr(b.state.kind) ? [b.type, b.type + '.' + b.state.kind] : [b.type];
// a close (profiles/successor.md, What a close ends): a counted observe of kind close about the person, by someone else, under a successor grant the
// person gave in their own name to the close's author, that no stop or decline has ended, with the triggers of as many of its witnesses as it needs
// in the close's causal past and none defeated by the person; and that carries none of keep on (state.continues); only those inScope. Its hash, the
// lowest of several.
// count: which blocks count (the identity fold reads by signatures alone, every block counting, since judging forks needs that fold)
function closedBy(person, keep, pool, inScope = () => true, count = b => counts(b, pool)) { return closesOf(person, keep, pool, inScope, count)[0] || null; }
// every such close, sorted by hash. A stop of the successor grant ends it only for a close that sees the stop (authority.md, Ending), and a successor
// who has died closes no one: their own counted close in this close's causal past voids it.
function closesOf(person, keep, pool, inScope = () => true, count = b => counts(b, pool)) {
  const backs = (g, o) => {
    // the successor's decline ends it for the closes that see it; the person's own stop of it voids every close under it, whenever it came
    const stoppedByPerson = !!g && pool.all().some(u => u.type === 'grant' && u.state.status === 'stopped' && u.refs.updates === g.hash && u.refs.author === person && count(u));
    if (!g || g.type !== 'grant' || g.state.status !== undefined || g.state.kind !== 'successor' || g.refs.author !== person || g.refs.as !== undefined || g.refs.to !== o.refs.author || ended(g, pool, count, h => pool.sees(o.hash, h)) || stoppedByPerson || !count(g) ||
      (isObj(g.state.scope) && g.state.scope.acts !== undefined && !actNames(o).some(n => asList(g.state.scope.acts).includes(n)))) return false;
    const past = pool.past(o.hash);
    const denied = t => pool.all().some(d => asList(d.refs.defeats).includes(t.hash) && d.refs.author === person && count(d));
    const signers = new Set(pool.all().filter(t => t.type === 'observe' && t.state.kind === 'trigger' && t.refs.under === g.hash && asList(t.refs.subject).includes(person) &&
      asList(g.state.witnesses).includes(t.refs.author) && past.has(t.hash) && count(t) && !denied(t)).map(t => t.refs.author));
    return quorum(signers, Number.isInteger(g.state.needed) ? g.state.needed : null);
  };
  return pool.all().filter(o => o.type === 'observe' && o.state.kind === 'close' && asList(o.refs.subject).includes(person) && o.refs.author !== person && inScope(o.hash) &&
    count(o) && backs(pool.get(o.refs.under), o) && !keep.some(k => asList(o.state.continues).includes(k)) &&
    !closesOf(o.refs.author, [], pool, h => h !== o.hash && pool.sees(o.hash, h), count).length).map(o => o.hash).sort();
}
// whether a block's author receives a grant: open (no refs.to), made to them, or made to a role of a circle they hold in the fold of the block's causal
// past, the block within the cuts of their ended grants (circles.md, The cut). A to that is not one id names no one.
function receives(g, b, pool) {
  return receivesAs(g, b.refs.author, (circle, role) => holdsRoleAt(b, circle, role, pool));
}
// the receiver rule for a receiver `who`, `holds(circle, role)` saying whether they hold the role (authority.md): open, or made to them, or to a role
// they hold. A refs.to that is not one id names no one; any to_role makes it a grant to a role, and one that is not a role's name names no one.
function receivesAs(g, who, holds) {
  if (g.refs.to === undefined) return true;
  if (!isStr(g.refs.to) || g.refs.to === '') return false;
  if (g.state.to_role === undefined) return g.refs.to === who;
  if (!isStr(g.state.to_role) || g.state.to_role === '') return false;
  return holds(g.refs.to, g.state.to_role);
}
// ended(g, pool, count, seen): a grant ends at a counted stop by its grantor (its author, or, for a grant signed as a circle, one who may sign for it), or
// a decline or leaving by its receiver; only for the blocks that see the stop (seen), as a death ends it (authority.md, Ending)
function ended(g, pool, count = b => counts(b, pool), seen = () => true) {
  return pool.all().some(u => u.type === 'grant' && ['stopped', 'declined'].includes(u.state.status) && count(u) && seen(u.hash) && (
    (u.refs.updates === g.hash && (u.refs.author === g.refs.author || (g.refs.as !== undefined && u.refs.as === g.refs.as && mayActAsIn(u, g.refs.as, pool)))) ||
    (u.refs.answers === g.hash && isStr(g.refs.to) && u.refs.author === g.refs.to)));
}
// A grant is live only while every ancestor grant is live (invariant 9). For a block that relies on it, a death ends it only when the close is in that
// block's causal past (profiles/successor.md: from that block on).
function grantLive(g, pool, seen = new Set(), relying) {
  if (!g || g.type !== 'grant' || seen.has(g.hash)) return false;
  seen.add(g.hash);
  // a block with a status is a stop or an answer, never a grant (authority.md); a stop or a decline ends it for the blocks that see it (Ending)
  const seenBy = pool.seenBy(relying);
  if (g.state.status !== undefined || !binds(g, pool) || ended(g, pool, undefined, seenBy)) return false;
  // an act dated (its own at) at or after the grant's scope.until acts under no grant (decision D14): its signer's own date says the grant had run out
  if (relying && atMs(relying) !== null && ranOut(g, relying)) return false;
  // a grant signed as a circle gives the circle's authority only when its signer may sign for it there, with the hands it needs; for a block that
  // relies on it, only the confirms in that block's causal past count (circles.md, Many hands)
  if (g.refs.as !== undefined) {
    const within = relying ? new Pool(pool.all().filter(b => pool.sees(relying.hash, b.hash))) : pool;
    if (principalOf(g, within) === null) return false;
  }
  // a grant a person gave in their own name ends at a counted close of them, unless it carries the grant on (authority.md, Ending)
  if (g.refs.as === undefined && g.state.kind !== 'successor' && closedBy(g.refs.author, [g.hash], pool, seenBy)) return false;
  // a successor grant has no power until the person's death (profiles/successor.md): a block under it, other than a trigger or a close, needs a
  // counted close of the person under that grant in its causal past
  // a voided close voids only what the successor claimed for himself (decision d1): an act of theirs someone else built on (a counted block of another,
  // neither the person nor the successor, that names it, or whose transfer it accepts) stands when that block's causal past holds a close that counted there
  const backedIn = sub => closesOf(g.refs.author, [], sub, () => true, b => counts(b, pool)).some(h => seenBy(h) && sub.get(h).refs.under === g.hash);
  const reliedOn = () => builtOn(relying, pool, g.refs.author, g.refs.to).some(o => {
    const seen = pool.past(o.hash);
    return backedIn(new Pool(pool.all().filter(b => seen.has(b.hash) || b.hash === relying.hash), true));
  });
  if (relying && g.state.kind === 'successor' && !(relying.type === 'observe' && ['trigger', 'close'].includes(relying.state.kind)) &&
    !closesOf(g.refs.author, [], pool).some(h => seenBy(h) && pool.get(h).refs.under === g.hash) && !reliedOn()) return false;
  if (g.refs.parent !== undefined) return grantLive(pool.get(g.refs.parent), pool, seen, relying);
  return true;
}
function whyNotUnder(b, poolIn) {
  const pool = poolOf(poolIn);
  const fail = d => [{ code: 'not_live', detail: d }];
  const g = pool.get(b.refs.under);
  if (!g || g.type !== 'grant') return fail('the grant is not held');
  // a witness's trigger is the witness's own word under a successor grant, which is for the successor (profiles/successor.md)
  const trigger = b.type === 'observe' && b.state.kind === 'trigger' && g.state.kind === 'successor';
  if (trigger && !asList(g.state.witnesses).includes(b.refs.author)) return fail('the signer is not a witness of the successor grant');
  if (!trigger && !receives(g, b, pool)) return fail('the signer is not the receiver of the grant');
  if (!grantLive(g, pool, new Set(), b)) return fail('the grant is not live');
  const sc = !trigger && isObj(g.state.scope) ? g.state.scope : {};
  const names = actNames(b);
  if (!trigger && (sc.acts === undefined || !names.some(n => asList(sc.acts).includes(n)))) return fail('the act is outside the grant\'s scope');
  // scope.parties: every side the block deals with (its from, to, to_owner and to_holder, and for an answer the sides of the block it answers, or
  // that block's author when it names none) is in parties, its principal aside (authority.md)
  const principal = principalOf(g, pool);
  if (!trigger) { // a grant that states no parties names none: no one beyond its principal
    const ans = isStr(b.refs.answers) ? pool.get(b.refs.answers) : null;
    const sides = ['from', 'to', 'to_owner', 'to_holder'].flatMap(k => asList(b.refs[k]));
    if (ans) { const named = ['from', 'to'].flatMap(k => asList(ans.refs[k])); sides.push(...(named.length ? named : asList(ans.refs.author))); }
    if (sides.some(id => id !== principal && !asList(sc.parties === undefined ? [] : sc.parties).includes(id))) return fail('a side the act deals with is outside the grant\'s parties');
  }
  // a limit the counterparty can see binds him too (authority.md, The limit is the principal's fence): an act whose own value is more than the
  // `limit` or `each` of a public grant (one with no audience) does not bind its principal. A sealed limit, or a grant with an audience, keeps the rule
  // that the fence is the principal's alone. The act is not cut down to the limit: as signed it exceeds the grant, so it does not bind.
  if (!trigger && g.audience === undefined && (sc.limit !== undefined || sc.each !== undefined)) {
    let value = null;
    if (b.type === 'transfer') value = b.state.money !== undefined ? b.state.money : b.state.amount !== undefined ? b.state.amount : null;
    else if (b.type === 'promise') {
      const answered = b.state.status === 'accepted' && isStr(b.refs.answers) ? pool.get(b.refs.answers) : null;
      const t = answered && isObj(answered.state.terms) ? answered.state.terms : isObj(b.state.terms) ? b.state.terms : null;
      if (t) value = termsTotal(t, isObj(b.state.terms) ? b.state.terms.quantity : undefined);
    }
    const fence = {}; if (sc.limit !== undefined) fence.limit = sc.limit; if (sc.each !== undefined) fence.each = sc.each;
    if (isObj(value) && !withinLimit(fence, value, 0)) return fail('the act is worth more than the limit the grant shows, so it does not bind its principal');
  }
  // acts that can be undone (authority.md): the default is that they cannot. An act that moves things or binds its principal is not live unless the
  // schema it names in refs.schema is trusted (the grantor's own, or one the grantor confirmed) and says undo: ok, or it has a specific accepted
  // ask naming the act, or a grant that names the act and has a limit.
  const act = names[names.length - 1];
  const asks = b.type === 'promise' && b.refs.answers === undefined && principal !== null && asList(b.refs.to).includes(principal) && !asList(b.refs.from).includes(principal);
  const moves = b.type === 'transfer' || b.type === 'transform' || (b.type === 'promise' && !['declined', 'stopped'].includes(b.state.status) && !asks);
  {
    const S = b.refs.schema && pool.get(b.refs.schema);
    const trusted = S && S.type === 'thing' && S.state.kind === 'schema' && principal !== null &&
      (speakerOf(S, pool) === principal || pool.all().some(c => asList(c.refs.confirms).includes(S.hash) && speakerOf(c, pool) === principal));
    const mark = trusted ? S.state.undo : undefined;
    // irreversible: a trusted schema says never (whatever the block's type), or the act moves things or binds and no trusted schema says ok. A
    // successor acts as the person did once the person has died: the death conditions are its fence (profiles/successor.md)
    if (g.state.kind !== 'successor' && (mark === 'never' || (mark !== 'ok' && moves))) {
      const specificGrant = (sc.limit !== undefined || sc.each !== undefined || sc.limit_commitment !== undefined) && asList(sc.acts).includes(act); // a cap on each act alone is a limit too
      // a specific ask backs one act (authority.md, How an ask names the act): the act names it in for, it names the act, the principal answered it
      // accepted (counted) and no stop or decline of it by the principal is in the act's causal past, and of the acts under a grant that rely on it
      // this one is the first in causal order (one that crosses another backs neither)
      const byPrincipal = x => principal !== null && speakerOf(x, pool) === principal && counts(x, pool);
      const movesOrBinds = x => x.type === 'transfer' || x.type === 'transform' || (x.type === 'promise' && !['declined', 'stopped'].includes(x.state.status) &&
        !(x.refs.answers === undefined && principal !== null && asList(x.refs.to).includes(principal) && !asList(x.refs.from).includes(principal)));
      // a rival counts only if it is counted and acts under this grant or one passed on from it, by one that grant is made for (release 13)
      const rivalOf = o => {
        if (!counts(o, pool)) return false;
        let at = o.refs.under, steps = 0;
        while (at !== undefined && at !== g.hash && steps++ < 64) { const x = pool.get(at); at = x ? x.refs.parent : undefined; }
        const og = pool.get(o.refs.under);
        return at === g.hash && !!og && receives(og, o, pool);
      };
      const askedAndAccepted = asList(b.refs.for).some(h => {
        const ask = pool.get(h);
        return ask && ask.type === 'promise' && (ask.state.what === act || (ask.refs.schema !== undefined && ask.refs.schema === b.refs.schema)) &&
          pool.all().some(a => a.type === 'promise' && a.refs.answers === ask.hash && a.state.status === 'accepted' && byPrincipal(a)) &&
          !pool.all().some(w => ['stopped', 'declined'].includes(w.state.status) && (w.refs.answers === ask.hash || w.refs.updates === ask.hash) && pool.sees(b.hash, w.hash) && byPrincipal(w)) &&
          !pool.all().some(o => o.hash !== b.hash && o.refs.answers !== ask.hash && o.refs.under !== undefined && asList(o.refs.for).includes(ask.hash) && movesOrBinds(o) && rivalOf(o) && !pool.sees(o.hash, b.hash));
      });
      if (!specificGrant && !askedAndAccepted) return fail('an act that moves things or binds is irreversible unless a trusted schema says undo ok; it needs a specific accepted ask or a grant that names it with a limit');
    }
  }
  return [];
}
// live_grant (view): every grant's scope.until is later than the clock of the node that relies on the act
const liveGrant = (block, grants, clock) => grants.every(g => { const u = g.state && g.state.scope && g.state.scope.until; return u === undefined || u > clock; });
// withdrawal_seen (view): in the causal past of the counterparty's block, or arrived on its node
function withdrawalSeen(w, block, blocks, arrivals) {
  // the two blocks are read with the input: one no node would take is no word, seen by no one (folds.md)
  const pool = new Pool([...poolOf(blocks).all().filter(x => x.hash !== w.hash && x.hash !== block.hash), w, block]);
  if (!pool.get(w.hash) || !pool.get(block.hash)) return false;
  return pool.sees(block.hash, w.hash) || !!(arrivals && arrivals[w.hash] !== undefined);
}

// ================================================================ circles (circles.md, folds.md)
// The fold reads the circle and every member grant naming it, in causal order. limit = a set of hashes (the causal past of a block).
// The roles a member holds for a block, by the block's own date (decision H11): a member grant with scope.until gives its roles to blocks dated before
// it and none to a block dated at or after it, or with no date (ranOut); holding through several grants, the member keeps the roles of those still
// running. null when no grant of theirs runs for that block.
function rolesAt(m, block, pool) {
  const grants = asList(m.grants);
  const running = grants.filter(h => !(pool.get(h) && ranOut(pool.get(h), block)));
  if (running.length === grants.length) return m.roles;
  if (!running.length) return null;
  const given = new Set(running.flatMap(h => { const g = pool.get(h); return !g ? [] : g.type === 'actor' ? m.roles : asList(g.state.roles).filter(isStr); }));
  return m.roles.filter(r => given.has(r));
}
// One top-level read memoises every fold of a sub-set (the same circle, the same set, the same blocks set aside): a fold is a function of its input.
function circleFold(circleId, poolIn, limit, exclude) {
  const pool = poolOf(poolIn);
  const key = circleId + '|' + (limit ? [...limit].sort().join(',') : '*') + '|' + (exclude ? [...exclude].sort().join(',') : '');
  if (pool.folds.has(key)) return pool.folds.get(key);
  const out = circleFoldNow(circleId, pool, limit, exclude);
  pool.folds.set(key, out);
  return out;
}
function circleFoldNow(circleId, pool, limit, exclude) {
  const inScope = h => (!limit || limit.has(h)) && !(exclude && exclude.has(h));
  const C = pool.get(circleId);
  const empty = { founder: null, members: {}, removed: {}, roles: [], cuts: [], kept: new Set(), crossing: new Set() };
  // a circle is an actor of kind circle (circles.md)
  if (!C || C.type !== 'actor' || C.state.kind !== 'circle') return empty;
  const founder = C.refs.author;
  // a causal past that does not hold the circle has no members: the circle is not yet (folds.md, circle_state)
  if (limit && !limit.has(circleId)) return { ...empty, founder };
  const roles = Array.isArray(C.state.roles) ? C.state.roles : [];
  // a circle whose roles carry admit or remove states it (decision F2); one whose roles carry neither removes no one
  // the stated removal.needed, a whole number of at least 1; with none stated (or a malformed one) no removal-like act stands: no number is filled in
  const needed = isObj(C.state.removal) && Number.isInteger(C.state.removal.needed) && C.state.removal.needed >= 1 ? C.state.removal.needed : null;
  // a role that carries admit or remove: taking it away is like a removal (circles.md, The removal rule)
  const guarded = r => powersOf(C, [r]).has('admit') || powersOf(C, [r]).has('remove');
  // every member grant naming the circle, and every grant that answers or updates one of them (an acceptance, a leaving, a stop): it need carry
  // no kind or subject of its own. The founding block is the founder's first member grant (circles.md, The founder), so a grant that answers or
  // updates the circle's block changes, leaves or stops the founder's membership.
  const grants = pool.all().filter(b => b.type === 'grant' && b.state.kind === 'member' && b.refs.subject === circleId && inScope(b.hash) && counts(b, pool));
  for (let grew = true; grew;) {
    grew = false;
    for (const b of pool.all()) {
      if (b.type !== 'grant' || grants.includes(b) || !inScope(b.hash) || !counts(b, pool)) continue;
      if (b.refs.answers === circleId || b.refs.updates === circleId || grants.some(g => b.refs.answers === g.hash || b.refs.updates === g.hash)) { grants.push(b); grew = true; }
    }
  }
  const founderRoles = roles.length ? [roles[0].name] : [];
  const isFounding = g => g === C;
  const members = {};
  // powers of an author at a block: the circle fold of the block's causal past (recursion on a strictly smaller set)
  const holdsAt = (author, power, atBlock) => {
    const f = circleFold(circleId, pool, pool.before(atBlock.hash), exclude);
    const m = f.members[author];
    const r = m ? rolesAt(m, atBlock, pool) : null;
    return !!r && powersOf(C, r).has(power);
  };
  // base member grants: the founding block (the founder's first, accepted by being written), and every member grant that is not an answer nor a
  // version of another grant
  const invites = [C, ...grants.filter(g => g.refs.answers === undefined && g.refs.updates === undefined && g.state.status === undefined)];
  // the founder is a member like any other, by the founding block: their roles can be changed, and they can leave or be removed, as anyone
  // an open member grant (no refs.to) carries no power: one that names a role with sign, admit or remove counts for nothing (circles.md, Membership)
  const openGrant = g => !isFounding(g) && g.refs.to === undefined;
  const powerless = g => !openGrant(g) || powersOf(C, g.state.roles).size === 0;
  const validInvite = g => isFounding(g) || (g.refs.as === circleId && powerless(g) && holdsAt(g.refs.author, 'admit', g));
  // powers narrow as they pass: a block gives a role only when its signer holds, in the fold of its causal past, every power the role carries
  const mayGive = (v, r) => isFounding(v) || [...powersOf(C, [r])].every(p => holdsAt(v.refs.author, p, v));
  // a change of a member grant updates the grant or an earlier change of it: all are the same grant, applied in causal order (circles.md)
  const versionsOf = (base) => {
    const seen = new Set([base.hash]), more = [];
    for (let grew = true; grew;) {
      grew = false;
      for (const u of grants) if (!seen.has(u.hash) && seen.has(u.refs.updates) && u.state.status === undefined && u.refs.answers === undefined && Array.isArray(u.state.roles) && u.refs.as === circleId && (!openGrant(base) || powersOf(C, u.state.roles).size === 0) && holdsAt(u.refs.author, 'admit', u)) { seen.add(u.hash); more.push(u); grew = true; }
    }
    return [base, ...more];
  };
  // a member's accepts of a version (every one: a repeat acceptance makes nothing new, and which one a reader meets first decides nothing)
  const acceptsOf = (v, m) => isFounding(v) ? (m === founder ? [C] : []) : grants.filter(a => a.refs.answers === v.hash && a.state.status === 'accepted' && a.refs.author === m);
  const listed = v => isFounding(v) ? founderRoles : [...new Set(asList(v.state.roles))];
  // the roles a member holds by an invitation: roles taken away count at once; a role added counts once the member accepts that change (assume: as
  // if they accepted every change). A change starts from the roles held at the changes it saw (those no other it saw follows), keeping a role only
  // where every one of them holds it; the member holds what every last change holds. A role that carries admit or remove is taken away only once
  // removal.needed different holders of remove have each made a change that drops it (lists it not, having seen a version that lists it). No order
  // of changes that do not see each other is read.
  const rolesBy = (inv, chain, m, assume) => {
    const dropped = r => quorum(chain.filter(v => v !== inv && !listed(v).includes(r) && chain.some(u => u !== v && pool.sees(v.hash, u.hash) && listed(u).includes(r))).filter(v => holdsAt(v.refs.author, 'remove', v)).map(v => v.refs.author), needed);
    const held = new Map();
    const meet = vs => { const sets = vs.map(v => held.get(v.hash)); return sets.length ? sets[0].filter(r => sets.every(x => x.includes(r))) : []; };
    for (const v of [...chain].sort((a, b) => pool.past(a.hash).size - pool.past(b.hash).size)) {
      if (v === inv) { held.set(v.hash, listed(inv).filter(r => mayGive(inv, r))); continue; }
      const before = meet(latest(chain.filter(u => u !== v && pool.sees(v.hash, u.hash)), pool)), ack = assume || acceptsOf(v, m).length > 0;
      const mine = listed(v);
      // a role kept is not given; a role added counts once accepted, and only if its changer holds every power it carries
      held.set(v.hash, [...mine.filter(r => before.includes(r) || (ack && mayGive(v, r))), ...before.filter(r => !mine.includes(r) && guarded(r) && !dropped(r))]);
    }
    const last = latest(chain, pool);
    const counted = meet(last);
    return last.length > 1 ? counted.sort() : counted;
  };
  const infos = [], early = [], cuts = [];
  const kept = new Set(), crossing = new Set();
  for (const inv of invites) {
    if (!validInvite(inv)) continue;
    const chain = versionsOf(inv), versions = new Set(chain.map(v => v.hash));
    // who joined: the one it names, or, for an open grant (no refs.to), everyone who accepts it (circles.md)
    // a refs.to that is not one id names no one (authority.md)
    const joiners = isFounding(inv) ? [founder] : inv.refs.to !== undefined ? (isStr(inv.refs.to) && inv.refs.to !== '' ? [inv.refs.to] : []) : [...new Set(grants.filter(a => a.refs.answers === inv.hash && a.state.status === 'accepted').map(a => a.refs.author))];
    for (const m of joiners) {
      const accs = acceptsOf(inv, m);
      if (!accs.length) continue;
      // every stop of a version naming the member: their own stopped or declined answer, their own stopped update (leaving: no power, no quorum, no
      // crossing), or a stopped update as the circle by a holder of remove
      const stops = [];
      for (const u of grants) {
        if (versions.has(u.refs.answers) && ['stopped', 'declined'].includes(u.state.status) && u.refs.author === m) stops.push({ m, by: m, block: u, leave: true });
        else if (versions.has(u.refs.updates) && u.refs.answers === undefined && u.state.status === 'stopped') {
          if (u.refs.author === m) stops.push({ m, by: m, block: u, leave: true });
          // an open grant's joiner who stops it ends it for themselves alone, whatever they hold (circles.md, Leaving). A remover's stop of an
          // open grant (decision H12): with no refs.to it ends only the joins it has not seen, and every member who joined by it stays; naming a joiner in
          // refs.to it removes that joiner, by the circle's removal rule; a refs.to that is not one id names no one
          else if (u.refs.as === circleId && !(openGrant(inv) && joiners.includes(u.refs.author)) && (!openGrant(inv) || (u.refs.to === undefined ? !accs.some(a => pool.sees(u.hash, a.hash)) : u.refs.to === m)) && holdsAt(u.refs.author, 'remove', u)) stops.push({ m, by: u.refs.author, block: u, leave: false });
        }
      }
      // which stops stand on their own: a removal of a holder of admit or remove stands only with N holders of remove stopping that same grant
      // (stops of other grants do not add up), judged in the fold of the stop's causal past, and so does a stop that saw none of the member's accepts
      // of a grant that gives admit or remove (as if they had accepted every version the stop has seen); a leaving always stands (circles.md)
      const sawAny = s => accs.some(a => pool.sees(s.block.hash, a.hash));
      const agreed = quorum(stops.filter(x => !x.leave).map(x => x.by), needed);
      const gives = s => { const seen = chain.filter(v => pool.sees(s.block.hash, v.hash)); return seen.length > 0 && rolesBy(inv, seen, m, true).some(guarded); };
      for (const s of stops) s.stands = s.leave || agreed || !(holdsAt(m, 'admit', s.block) || holdsAt(m, 'remove', s.block) || (!sawAny(s) && gives(s)));
      // a standing stop that has seen none of the member's accepts comes before the answer: the member never joined by this grant
      if (stops.some(s => s.stands && !sawAny(s))) {
        for (const s of stops) if (s.stands) { cuts.push({ m, g: inv.hash, cut: s.block.hash }); if (!s.leave) early.push(s); else kept.add(s.block.hash); }
        continue;
      }
      // the first acceptances (a later one makes nothing new); two from two devices that do not see each other are both first
      const firsts = earliest(accs, pool);
      infos.push({ m, inv, firsts, roles: rolesBy(inv, chain, m, false), stops });
    }
  }
  // crossings: rings of standing removals, each removing the author of the next, that come back to the first, no stop of a ring seeing another (two
  // removers each removing the other is a ring of two). Every removal in a ring stands (decision D13: no crossing after removal, and no member is
  // immune); each is kept from the cut of the one before it. Rivals are every removal that stands on its own and every early removal.
  const rivals = [...early, ...infos.flatMap(i => i.stops.filter(s => !s.leave && s.stands))];
  const apart = (x, y) => !pool.sees(x.block.hash, y.block.hash) && !pool.sees(y.block.hash, x.block.hash);
  const ringsOf = s => {
    const out = [];
    if (!s.stands || s.leave) return out;
    const walk = (at, path, nodes) => {
      for (const x of rivals) {
        if (x.by !== at || path.some(p => p.block.hash === x.block.hash || !apart(p, x))) continue;
        if (x.m === s.by) out.push([...path, x]);
        else if (!nodes.includes(x.m)) walk(x.m, [...path, x], [...nodes, x.m]);
      }
    };
    walk(s.m, [s], [s.by, s.m]);
    return out;
  };
  const ends = new Map();
  for (const info of infos) for (const s of info.stops) {
    // a leaving is never set aside; each stop of a ring is kept only from the cut of the one before it (the stop that removes its author)
    if (s.leave) kept.add(s.block.hash);
    const rings = ringsOf(s);
    for (const ring of rings) ring.forEach((x, i) => crossing.add(x.block.hash + '|' + ring[(i + ring.length - 1) % ring.length].block.hash));
    // no crossing after removal (decision D13): every removal in a ring stands; the earliest member gets no immunity
    ends.set(s, s.stands);
  }
  const endsOf = info => info.stops.filter(s => ends.get(s));
  // an answer counts only if the invitation came after the removal: a joining whose first acceptances all come after (or beside) a removal that ended
  // another of the member's grants, by an invitation that has not seen it, never was (circles.md, Removed)
  // voiding a joining that gives admit or remove this way is a removal-like act: it needs a removal that `needed` different removers made
  const removals = infos.flatMap(i => { const ends = endsOf(i).filter(s => !s.leave); const agreed = quorum(ends.map(s => s.by), needed); return ends.map(s => ({ m: i.m, h: s.block.hash, agreed })); });
  const counted = infos.filter(i => !removals.some(r => r.m === i.m && (r.agreed || !i.roles.some(guarded)) && !pool.sees(i.inv.hash, r.h) && !i.firsts.some(a => pool.sees(r.h, a.hash))));
  // A member may hold several accepted grants. The heads are those no later acceptance of theirs supersedes; a member is in while a head has not ended
  // and holds the roles of every head that has not; they are out when every head has ended (removed names no counted_to: a circle reads none).
  const removedMap = {};
  for (const m of [...new Set(counted.map(i => i.m))]) {
    const list = counted.filter(i => i.m === m);
    // every grant that ended keeps the cut of every stop that ended it, a head or not: the stop itself (circles.md, The cut)
    for (const info of list) for (const s of endsOf(info)) cuts.push({ m, g: info.inv.hash, cut: s.block.hash });
    // a grant is superseded once the member accepted another having seen any first acceptance of it: no acceptance is chosen by its hash
    const heads = list.filter(info => !list.some(o => o !== info && o.firsts.some(a => info.firsts.some(b => pool.sees(a.hash, b.hash)))));
    const live = heads.filter(h => !endsOf(h).length);
    if (live.length) {
      const roles = live.length === 1 ? live[0].roles.slice() : [...new Set(live.flatMap(h => h.roles))].sort();
      const grant = live.map(h => h.inv.hash).sort()[0];
      members[m] = { roles, grant, counted_to: null, grants: live.map(h => h.inv.hash).sort() };
    } else if (heads.length) removedMap[m] = null;
  }
  // a member who has died is out from the close (profiles/successor.md), unless it carries the circle or their grant on; removed with no counted_to
  // the close cuts like a removal (decision d2): a block of theirs it does not have in its causal past carries no authority from the circle
  for (const [m, info] of Object.entries(members)) { const close = closedBy(m, [circleId, ...info.grants], pool, h => !limit || limit.has(h)); if (close) { delete members[m]; removedMap[m] = null; for (const g of info.grants) cuts.push({ m, g, cut: close }); } }
  return { founder, members, removed: removedMap, roles, cuts, kept, crossing };
}
// circle_state: the fold, then the cutoff (circles.md): a block a member signed as the circle that is neither the cut of a grant that ended nor in
// the cut's causal past carries no authority for the circle, whether or not it saw the stop. The grants such a block made are then set aside and the
// circle read again.
function circleWhole(circleId, poolIn, limit) {
  const pool = poolOf(poolIn);
  // the blocks a fold sets aside: every block by a member whose grant ended that would use the circle's authority (signed as it, a confirm, an act
  // under a grant to a role, a signal from a holder of circle#role, a removal: one in a crossing is kept only from the cut of the stop in it that
  // removes its author) and is neither the cut nor in its causal past. Their own answers to grants and their own leavings are theirs, and are never
  // set aside; nor is a block someone outside the circle built on before a stop: a counted block by another, no member in the circle's fold of its
  // causal past, that holds the block in its causal past and is in the causal past of a stop that ended one of the member's grants.
  const voidOf = (f, exclude) => {
    const out = new Set();
    if (!f.cuts || !f.cuts.length) return out;
    const cutMembers = new Set(f.cuts.map(c => c.m));
    // what others built on stands (decision C6): a counted block by an outsider (no member in the circle's fold of its causal past) that names the block
    // itself (any ref but its own prev) and has none of the member's cuts in its causal past: he had not seen the removal
    const reliedOn = (b, author) => builtOn(b, pool, author).some(o => {
      if (f.cuts.some(c => c.m === author && (c.cut === o.hash || pool.sees(o.hash, c.cut)))) return false;
      const past = pool.before(o.hash);
      return !circleFold(circleId, pool, past, exclude).members[o.refs.author];
    });
    for (const b of pool.all()) {
      const author = b.refs.author;
      if (!isStr(author) || !cutMembers.has(author)) continue;
      if ((b.type === 'grant' && b.refs.answers !== undefined) || f.kept.has(b.hash)) continue;
      const past = pool.before(b.hash);
      const m = circleFold(circleId, pool, past, exclude).members[author];
      if (!m) continue;
      if (f.cuts.some(c => c.m === author && m.grants.includes(c.g) && b.hash !== c.cut && !pool.sees(c.cut, b.hash) && !f.crossing.has(b.hash + '|' + c.cut)) && !reliedOn(b, author)) out.add(b.hash);
    }
    return out;
  };
  // read the stops, set those blocks aside, read the grants again, until what is set aside no longer changes (a removal set aside gives its member
  // back their blocks)
  const same = (a, b) => a.size === b.size && [...a].every(x => b.has(x));
  let voided = new Set(), f = circleFold(circleId, pool);
  const tried = [];
  for (;;) {
    const next = voidOf(f, voided.size ? voided : undefined);
    if (same(next, voided) || tried.some(t => same(t, next))) break;
    tried.push(voided); voided = next;
    f = circleFold(circleId, pool, undefined, voided);
  }
  const out = limit ? circleFold(circleId, pool, limit, voided.size ? voided : undefined) : f;
  return { ...out, void: voided };
}
// a circle that is not held has no state: null (folds.md)
// with `within`, the circle as of that block's causal past: the fold of its past, the cuts judged with every block held (circles.md, The cut)
const circleState = (circleId, blocks, within) => {
  const pool = isObj(within) && isStr(within.hash) ? new Pool([within, ...poolOf(blocks).all()]) : poolOf(blocks);
  const C = pool.get(circleId);
  if (!C || C.type !== 'actor' || C.state.kind !== 'circle') return null;
  let past;
  if (isObj(within) && isStr(within.hash)) { past = pool.before(within.hash); }
  // within a block whose causal past does not hold the circle, there is no circle yet: null (folds.md)
  if (past && !past.has(circleId)) return null;
  const f = circleWhole(circleId, pool, past);
  // each member as protocol.json names it: { roles, grant, counted_to }
  const members = Object.fromEntries(Object.entries(f.members).map(([id, m]) => [id, { roles: m.roles, grant: m.grant, counted_to: m.counted_to }]));
  return { founder: f.founder, members, removed: f.removed };
};
// may_act_as(block, circle): the author holds a role with the sign power in the circle's fold of the block's causal past
// the powers the named roles of a circle carry (circles.md)
// a share of the members "p/q": whole numbers, 0 < p <= q, as { of_members: "p/q" } (folds.md, Counts); [p, q] or null
const shareOfMembers = (x) => { if (!isObj(x) || Object.keys(x).length !== 1 || typeof x.of_members !== 'string') return null; const m = /^([1-9][0-9]{0,8})\/([1-9][0-9]{0,8})$/.exec(x.of_members); if (!m) return null; const p = Number(m[1]), q = Number(m[2]); return p <= q ? [p, q] : null; };
const powersOf = (C, names) => new Set(asList(names).flatMap(n => ((Array.isArray(C.state.roles) ? C.state.roles : []).find(r => r.name === n) || { powers: [] }).powers));
// the author's membership in a circle as of a block's causal past, the block within the cuts of their ended grants (circles.md, The cut); null when none
const memberAt = (circleId, b, pool) => { const f = circleWhole(circleId, pool, pool.before(b.hash)); const m = f.members[b.refs.author]; return m && !f.void.has(b.hash) ? m : null; };
function mayActAsIn(block, circleId, pool) {
  if (!pool.get(block.hash)) return false; // a block that rests on blocks not held is not read yet
  if (circleId === undefined || circleId === null) return true; // GUESS: a block that signs for no circle needs no role
  if (block.refs.as !== circleId) return false;
  const C = pool.get(circleId), m = memberAt(circleId, block, pool);
  if (!m || !C) return false;
  const signs = (mm, b) => powersOf(C, rolesAt(mm, b, pool)).has('sign');
  if (!signs(m, block)) return false;
  // many hands (circles.md): where the circle needs N holders of sign, N different holders sign the block: its author, and holders who confirm it
  // needed.sign "all" (folds.md, Counts): every current holder of sign, counted in the fold of the block's causal past
  const nHolders = () => { const f = circleWhole(circleId, pool, pool.before(block.hash)); return Object.values(f.members).filter(mm => signs(mm, block)).length; };
  // needed.sign { of_members: "p/q" } (folds.md, Counts): that share of the members in the fold of the block's causal past, rounded up, at least 1
  const nMembers = () => { const f = circleWhole(circleId, pool, pool.before(block.hash)); return Object.values(f.members).filter(mm => rolesAt(mm, block, pool) !== null).length; };
  const sh = isObj(C.state.needed) ? shareOfMembers(C.state.needed.sign) : null;
  const n = isObj(C.state.needed) && Number.isInteger(C.state.needed.sign) ? C.state.needed.sign : isObj(C.state.needed) && C.state.needed.sign === 'all' ? nHolders() : sh ? Math.max(1, Math.ceil(nMembers() * sh[0] / sh[1])) : 1;
  const signers = new Set([block.refs.author]);
  for (const c of pool.all()) {
    if (quorum(signers, n)) break;
    if (!asList(c.refs.confirms).includes(block.hash) || !counts(c, pool) || signers.has(c.refs.author)) continue;
    const cm = memberAt(circleId, c, pool);
    if (cm && signs(cm, c)) signers.add(c.refs.author);
  }
  return quorum(signers, n);
}
// with a role named, whether the author holds that role in the circle's fold of the block's causal past, the block within the cuts of their ended grants
// (a grant to a role, authority.md); the block need not be signed as the circle
function mayActAs(block, circleId, blocks, role) {
  const pool = new Pool([block, ...poolOf(blocks).all()]);
  if (role === undefined || role === null) return mayActAsIn(block, circleId, pool);
  return !!pool.get(block.hash) && holdsRoleAt(block, circleId, role, pool); // a block that rests on blocks not held is not read yet
}
function holdsRoleAt(block, circleId, role, pool) {
  if (!pool.get(circleId)) return false;
  const m = memberAt(circleId, block, pool);
  return !!m && asList(rolesAt(m, block, pool)).includes(role);
}
// members_then(block, recipient): the members of a circle (or the holders of circle#role) in the circle fold of the block's causal past
// A name with more than one #, or an empty part, means no one; the block's author is left out when the block is outside a cut of theirs (circles.md).
function membersThen(block, recipient, blocks) {
  const pool = new Pool([block, ...poolOf(blocks).all()]);
  const parts = recipient.split('#');
  if (parts.length > 2 || parts.some(x => x === '')) return [];
  const [circleId, role] = parts.length === 2 ? parts : [recipient, null];
  if (!pool.get(circleId)) return [];
  const past = pool.before(block.hash);
  const f = circleWhole(circleId, pool, past);
  return Object.entries(f.members).filter(([id, m]) => { const r = rolesAt(m, block, pool); return r !== null && (role === null || r.includes(role)) && !(id === block.refs.author && f.void.has(block.hash)); }).map(([id]) => id).sort();
}
// circle_key (profiles/rekeys.md)
function circleKey(circleId, blocks) {
  const pool = poolOf(blocks);
  const C = pool.get(circleId);
  if (!C) return { epoch: 0, keys: [], grants: [] }; // a circle the folds cannot read has no key
  const rekeys = pool.all().filter(b => b.type === 'grant' && b.state.kind === 'key' && b.state.epoch !== undefined && b.refs.subject === circleId && b.refs.as === circleId && counts(b, pool));
  const can = r => {
    const m = memberAt(circleId, r, pool);
    return !!m && powersOf(C, m.roles).has('rekey');
  };
  const ok = new Set();
  for (const r of rekeys.sort((a, b) => a.state.epoch - b.state.epoch)) {
    if (!can(r)) continue;
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

// ================================================================ decimals (core.md: amounts are decimal strings; the fold's counts are numbers)
function dec(s) { const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(s)); if (!m) return null; const f = m[3] || ''; return { n: BigInt(m[1] + m[2] + f), d: 10n ** BigInt(f.length) }; }
const decNum = a => (a && a.value !== undefined ? Number(a.value) : null);
// the sum of decimal strings, exactly, written with no trailing zeros
function decSum(values) {
  const ds = values.map(dec);
  const D = ds.reduce((m, x) => (x.d > m ? x.d : m), 1n);
  const n = ds.reduce((a, x) => a + x.n * (D / x.d), 0n);
  const abs = n < 0n ? -n : n, k = D.toString().length - 1;
  const frac = (abs % D).toString().padStart(k, '0').replace(/0+$/, '');
  return (n < 0n ? '-' : '') + (abs / D).toString() + (frac ? '.' + frac : '');
}
// money per unit: minor times quantity over per, rounded to the nearest minor unit, halves up
function perUnitBig(minor, per, qty) {
  const q = dec(qty.value), p = dec(per.value);
  let num = BigInt(minor) * q.n * p.d, den = p.n * q.d;
  if (den < 0n) { num = -num; den = -den; }
  // floor((2n + d) / 2d), rounding halves toward +infinity (BigInt division truncates toward zero)
  const top = 2n * num + den, bot = 2n * den, t = top / bot;
  return top < 0n && t * bot !== top ? t - 1n : t;
}
// A price or a payment is in a kind: a currency (money), or a unit of goods (an amount), written { goods: unit } so the two are never confused
// (promises.md, Terms, `price`). Goods are counted as whole numbers of the finest decimal place any amount in the deal uses (GS), so sums are exact.
let GS = 0;
const places = t => { const m = /\.(\d+)$/.exec(String(t)); return m ? m[1].length : 0; };
const isGoodsPrice = p => isObj(p) && !perUnit(p) && p.minor === undefined && isStr(p.value) && isStr(p.unit) && !('figure' in p);
const scaledBig = text => { const f = dec(text); return f ? (f.n * 10n ** BigInt(GS)) / f.d : null; };
const scaledText = big => { const neg = big < 0n, a = neg ? -big : big, k = GS, w = (a / 10n ** BigInt(k)).toString(), f = (a % 10n ** BigInt(k)).toString().padStart(k, '0').replace(/0+$/, ''); return (neg ? '-' : '') + w + (f ? '.' + f : ''); };
const kindOfValue = m => (isObj(m) ? (m.minor !== undefined ? m.currency : isStr(m.unit) && m.value !== undefined ? { goods: m.unit } : undefined) : undefined);
const bigOfValue = m => (isObj(m) ? (m.minor !== undefined ? BigInt(m.minor) : scaledBig(m.value)) : null);
const kindOut = (big, kind) => (isObj(kind) && kind.goods !== undefined ? { value: scaledText(big), unit: kind.goods } : { minor: minorOut(big), currency: kind === undefined ? null : kind });
// the finest decimal place of any goods amount a block carries: a price, a payment, a covers
const blockScale = b => {
  const t = b.state && b.state.terms, ps = [t && t.price, ...(t && Array.isArray(t.lines) ? t.lines.map(l => l && l.price) : [])];
  return Math.max(0, ...[...ps, b.state && b.state.amount, b.state && b.state.covers].filter(x => isObj(x) && x.unit !== undefined && isStr(x.value)).map(x => places(x.value)));
};
// what a price comes to (folds.md, stage 2), as a BigInt of minor units, or null when it cannot be computed: flat money is its minor; money per unit
// is minor times the quantity over per, the quantity an amount in per's unit and per not zero
function totalOf(price, qty) {
  if (!isObj(price)) return null;
  if (isGoodsPrice(price)) return scaledBig(price.value);
  if (!perUnit(price)) return Number.isInteger(price.minor) ? BigInt(price.minor) : null;
  if (!isObj(price.money) || !Number.isInteger(price.money.minor) || !isObj(price.per) || !isObj(qty) || qty.unit !== price.per.unit) return null;
  const p = dec(price.per.value), q = dec(qty.value);
  if (!p || !q || p.n === 0n) return null;
  return perUnitBig(price.money.minor, price.per, qty);
}
// what a promise's terms come to (folds.md, stage 2): each priced line, or the whole at the quantity chosen (else the terms'); lines in the first
// line's currency add up; null when a price has no total or nothing is priced
// a sum of minor units as a fold reports it: a number within ±(2^53 - 1), else its exact decimal text (folds.md, stage 2)
const minorOut = big => (big <= 9007199254740991n && big >= -9007199254740991n ? Number(big) : big.toString());
const curKey = c => (c === undefined || c === null ? '' : jcs(c));
const currencyOf = price => (isObj(price) ? (isGoodsPrice(price) ? { goods: price.unit } : isObj(price.money) ? price.money.currency : price.currency) : undefined);
// each priced line of the terms (or the whole price at `chosen`) with what it comes to and its currency; qtyFor(i, q) may restate a line's quantity
const pricedParts = (terms, chosen, qtyFor = (i, q) => q) => (Array.isArray(terms.lines) ? terms.lines.map((l, i) => ({ price: l.price, qty: qtyFor(i, l.quantity) })) : [{ price: terms.price, qty: qtyFor(0, chosen) }])
  .filter(x => isObj(x.price)).map(x => ({ big: totalOf(x.price, x.qty), currency: currencyOf(x.price) }));
// the parts in the first part's currency, added: money in different currencies is never added
const sumOwn = parts => parts.filter(x => curKey(x.currency) === curKey(parts[0].currency)).reduce((s, x) => s + x.big, 0n);
function termsTotal(terms, qty) {
  const t = isObj(terms) ? terms : {};
  GS = Math.max(0, ...[t.price, ...(Array.isArray(t.lines) ? t.lines.map(l => l && l.price) : [])].filter(x => isGoodsPrice(x)).map(x => places(x.value)));
  const parts = Array.isArray(t.lines) && t.lines.length ? pricedParts(t) : pricedParts({ price: t.price }, isObj(qty) ? qty : t.quantity);
  if (!parts.length || parts.some(x => x.big === null)) return null;
  return kindOut(sumOwn(parts), parts[0].currency === undefined ? null : parts[0].currency);
}
// an exact fraction reported as a number, rounded once
const fracNum = f => { const k = f.d.toString().length - 1; if (f.d !== 10n ** BigInt(k)) return Number(f.n) / Number(f.d); const a = f.n < 0n ? -f.n : f.n; return Number((f.n < 0n ? '-' : '') + (a / f.d).toString() + '.' + (a % f.d).toString().padStart(k, '0') + '0'); };
// exact fractions { n, d } of decimals (core.md section 3: a decimal is exact at any size, never a float): sums and comparisons
const frac = v => dec(v) || { n: 0n, d: 1n };
const fadd = (a, b) => ({ n: a.n * b.d + b.n * a.d, d: a.d * b.d });
const fcmp = (a, b) => { const x = a.n * b.d - b.n * a.d; return x < 0n ? -1 : x > 0n ? 1 : 0; };
// decimal strings (core.md section 3), compared exactly; NaN when either is not one
const decCmp = (x, y) => (isStr(x) && isStr(y) && RX.decimal.test(x) && RX.decimal.test(y) ? fcmp(dec(x), dec(y)) : NaN);
const fsum = vs => vs.reduce((t, v) => fadd(t, frac(v)), { n: 0n, d: 1n });

// ================================================================ a promise's stage (folds.md, promises.md)
// tookAt(r, hash, pool): the time a counted receipt carries a node's push answer, signed by a key of that node that still speaks, listing the hash as
// taken (decision D12, E1); null when it carries none. The receipt's own `derives_from` and the node it names are the caller's to ask.
function tookAt(r, hash, pool) {
  const an = r.state.answer;
  if (r.type !== 'observe' || r.state.kind !== 'receipt' || !counts(r, pool) || !isObj(an) || !isStr(an.node) || timeMs(an.at) === null || !Array.isArray(an.taken) || !an.taken.includes(hash)) return null;
  const idf = identityFold(an.node, pool);
  return idf.keys.some(k => !idf.frozen.includes(k) && answerSignedBy(an, k)) ? an.at : null;
}
function promiseStage(firstIn, poolIn, opts) {
  // the first promise is read with the blocks held; one that rests on blocks not held is not read yet: no stage (folds.md)
  const pool = new Pool(typeof firstIn === 'string' ? poolOf(poolIn).all() : [firstIn, ...poolOf(poolIn).all()]);
  if (poolIn instanceof Pool && poolIn.arrivals) pool.arrivals = poolIn.arrivals; // a view's reading with the reader's arrivals (decision c9)
  const P = pool.get(typeof firstIn === 'string' ? firstIn : firstIn.hash);
  if (!P) return null;
  GS = Math.max(0, ...pool.all().map(blockScale));
  const cover = b => {
    if (b.refs.under === undefined) return null;
    const g = pool.get(b.refs.under);
    // a grant that is not live, or not made for the block's author, is no grant: the block acts under none (folds.md, Who a block speaks for)
    if (!g || g.type !== 'grant' || !grantLive(g, pool, new Set(), b) || !receives(g, b, pool)) return null;
    // it names its act when it passes the door's whole authority test (authority.md)
    return { principal: principalOf(g, pool), covered: !whyNotUnder(b, pool).length };
  };
  const whoMemo = new Map();
  const who = b => { if (!whoMemo.has(b.hash)) whoMemo.set(b.hash, speakerOf(b, pool)); return whoMemo.get(b.hash); };
  // a promise is a quote request unless the grant it acts under names the act (promises.md, invariant 22). A promise under no grant it acts under is
  // its author's own word, whoever the author is (a person, a machine): it speaks for its author and binds them alone.
  const quoteOffer = b => { const c = cover(b); return c ? !c.covered : false; };
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
    const t = os && os.takers.find(x => x.allocation === P.hash);
    return t ? { O, R, t } : null;
  })();
  const Q = alloc ? alloc.O : P; // the root: sides, terms, what
  const out = { stage: null, stop: null, from: null, by: null, offer: Q.hash, accept: null, sides: { from: Q.refs.from === undefined ? null : Q.refs.from, to: Q.refs.to === undefined ? null : Q.refs.to }, quantity: null, takers: [], forks: [], lines: [], total: null, paid: null, stopped: [], disputed: [], due: null, paid_at: null, occurrences: [], referee_ties: [], uncovered: null, over_allocated: false, owed: null, owed_on: [], received_at: [], moved: [], price_fixed: null };
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
          !D.some(a => a.type === 'promise' && a.state.status === 'accepted' && a.refs.answers === o.hash && sideOfB(a) && sideOfB(a) !== sideOfB(o) && pool.sees(c.hash, a.hash))) next.push(c);
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
  const declines = D.filter(b => b.type === 'promise' && b.state.status === 'declined');
  // a withdrawal stops the offer it names (its updates or answers): an accept of that offer binds unless the withdrawal is in its causal past
  const stopsOne = (s, h) => s.refs.updates === h || s.refs.answers === h;
  const seenStop = a => stopsBefore.some(s => stopsOne(s, a.refs.answers) && pool.sees(a.hash, s.hash));
  // an accept consents to the terms of the offer it answers (invariant 15): where the offer's quantity is a range, the accept names a quantity in the
  // range's unit, within it; otherwise it names none, or the same (promises.md, Who may bind)
  // a deal conditioned on another deal binding (terms.condition { accepted: <first promise> }, decision H17) binds only once that deal binds, read from
  // its own stage in the same blocks; one that names nothing held, or leads back to a deal being read, holds for nothing (no reading loops)
  const visiting = (opts && opts.visiting) || [];
  const conditionBinds = o => {
    const c = isObj(termsOf(o).condition) && 'accepted' in termsOf(o).condition ? termsOf(o).condition : null;
    if (!c) return true;
    if (!isStr(c.accepted) || c.accepted === P.hash || visiting.includes(c.accepted)) return false;
    const x = pool.get(c.accepted);
    return !!x && stageBinds(promiseStage(x, pool, { visiting: [...visiting, P.hash] }));
  };
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
  const judgesFor = (sides, subject = P.hash) => {
    const sideOf = b => sides.find(x => who(b) === x);
    return [...new Set(pool.all().filter(g => g.type === 'grant' && g.state.kind === 'referee' && g.state.status === undefined && g.refs.subject === subject && counts(g, pool) && sideOf(g) !== undefined &&
      isStr(g.refs.to) && pool.all().some(a => a.type === 'grant' && a.state.status === 'accepted' && a.refs.answers === g.hash && counts(a, pool) && sideOf(a) !== undefined && sideOf(a) !== sideOf(g))).map(g => g.refs.to))].sort();
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
    const names = [...new Set([...asList(grounds.confirmers).filter(isStr), ...subjects.flatMap(x => judgesFor(sides, x))].filter(notSide))];
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
        if (n.includes('#')) { if (n.split('#')[0] === x) out.push({ referee: n, side, how: 'role' }); continue; }
        const c = circleState(x, pool);
        if (c && Object.prototype.hasOwnProperty.call(c.members, n)) out.push({ referee: n, side, how: 'member' });
        if (operatorsOf(n, pool).includes(x)) out.push({ referee: n, side, how: 'operator' });
      }
      const key = t => [t.referee, t.side, t.how];
      return out.sort((a, b) => { const p = key(a), q = key(b); for (let i = 0; i < 3; i++) if (p[i] !== q[i]) return p[i] < q[i] ? -1 : 1; return 0; });
    };
    // a side never rules through someone it appointed after the deal bound: a role held by a grant a side signed that the binding accept had not seen
    // speaks for no name
    const appointed = (o, n) => {
      if (!n.includes('#')) return false;
      const past = pool.before(o.hash);
      const m = pool.get(n.split('#')[0]) ? circleWhole(n.split('#')[0], pool, past).members[o.refs.author] : null;
      // signed by a side in its own name, or as a side's circle (decision H9)
      return !!m && asList(m.grants).some(g => { const gb = pool.get(g); return !!gb && (sides.includes(gb.refs.author) || sides.includes(gb.refs.as)) && !(bound && pool.sees(bound.hash, g)); });
    };
    const holdsName = (o, n) => counts(o, pool) && (n.includes('#') ? membersThen(o, n, pool).includes(o.refs.author) : n === o.refs.author) && !appointed(o, n) && !sided(o);
    const named = o => names.some(n => holdsName(o, n));
    // a name's word on a block, counting only its words dated (at) at or after since, when one is given (a backup's turn starts there)
    const voice = (n, h, since = null) => {
      const words = verb => pool.all().filter(c => asList(c.refs[verb]).includes(h) && holdsName(c, n) && datedFrom(c, since));
      const yes = words('confirms'), no = words('defeats');
      if (no.some(d => !yes.some(c => pool.sees(c.hash, d.hash)))) return false;
      return yes.length ? true : null;
    };
    // a name's own signed receipt of a dispute (decision E1, the D12 receipt): a counted observe of kind receipt that derives_from the dispute, whose
    // state.answer is a push answer from the name's node (node the name, or a holder of the role where the receipt stands), signed by a key that
    // speaks for that node, listing the dispute as taken: the earliest at over the block's disputes, the same on every node
    const askedAt = (n, disputes) => {
      const times = pool.all().map(o => {
        const d = asList(o.refs.derives_from).find(x => disputes.includes(x)), at = d === undefined ? null : tookAt(o, d, pool);
        return at !== null && (n.includes('#') ? membersThen(o, n, pool).includes(o.state.answer.node) : o.state.answer.node === n) ? at : null;
      }).filter(isStr).sort((a, b) => Date.parse(a) - Date.parse(b));
      return times.length ? times[0] : null;
    };
    // with a wait, the names are a chain: the first, and each backup after it once every name before it has said nothing on the block, counting only its
    // words dated at or after the wait has run from the name before it's own receipt of a side's dispute of the block. Signed times alone: no clock.
    const turn = (h, disputes = disputesOf) => {
      if (!wait) return names.map(n => [n, null]);
      const out = [];
      for (const [i, n] of names.entries()) {
        if (i === 0) { out.push([n, null]); continue; }
        if (out.some(([m, since]) => voice(m, h, since) !== null)) break;
        const asked = askedAt(names[i - 1], disputes(h));
        const t = asked === null ? null : timeMs(addDur(asked, wait));
        if (t === null) break;
        out.push([n, t]);
      }
      return out;
    };
    const ruling = h => {
      const said = turn(h).map(([n, since]) => [n, voice(n, h, since)]);
      if (wait) { const v = said.map(x => x[1]).find(x => x !== null); return v === undefined ? null : v; }
      const by = v => said.filter(x => x[1] === v).map(x => x[0]);
      return quorum(by(false), needed) ? false : quorum(by(true), needed) ? true : null;
    };
    return { names, needed, wait, holdsName, named, voice, turn, ruling, ties };
  };
  // ---- binding accepts
  let accept = null, takers = [], forks = [], freedBy = () => false; // freedBy: an allocation stopped onward, its quantity freed
  // a counter's deal has the counter's own terms, whole (decision H18)
  if (alloc) { accept = P; takers = [alloc.t]; if (alloc.R.state.status === undefined) live = alloc.R; }
  else if (self) accept = P;
  else if (!open) {
    // every binding accept of a live offer; the earliest in causal order binds, and two that do not see each other prove the accepter's lie:
    // neither binds and both are listed in forks
    const cands = [];
    // every offer of the deal (the first promise and its counters); an accept binds the one it answers when that was live where it stands
    for (const o of [Q, ...D.filter(x => x.type === 'promise' && x.state.status === undefined && x !== Q && x.refs.answers !== undefined)]) {
      const oSide = sideOfB(o);
      // the principal's own yes: an accept that speaks for the grantor of the grant the quote request was made under, itself no quote request; a bare
      // autonomous system has no principal, and nothing makes its word bind (promises.md, invariant 22)
      const c = cover(o);
      const principal = c ? c.principal : null;
      const principalOk = !quoteOffer(o) || (principal !== null && D.some(b => b.type === 'promise' && b.state.status === 'accepted' && b.refs.answers === o.hash && who(b) === principal && !quoteOffer(b)));
      // the offerer voids an accept by answering it declined only on an offer that carried expires (an accept that reached them late): an offer with
      // no expires is firm (promises.md, Who may bind)
      const expires = termsOf(o).expires !== undefined;
      for (const a of D) {
        if (a.type !== 'promise' || a.state.status !== 'accepted' || a.refs.answers !== o.hash || !sideOfB(a) || sideOfB(a) === oSide || quoteOffer(a) || !fits(a, o) || !conditionBinds(o)) continue;
        // a decline voids the accept only when the offerer never acted on it: no counted block of the offerer's side in the deal (but a decline
        // of it) has the accept in its causal past
        const actedOn = D.some(x => x !== a && sideOfB(x) === oSide && !(x.state.status === 'declined' && x.refs.answers === a.hash) && pool.sees(x.hash, a.hash));
        // a timely accept beats a late decline by her receipt (decision D12): a counted observe of kind receipt by the accepter's side, derives_from the
        // accept, whose state.answer is the offerer's node's push answer, signed by a key that speaks for the offer's author (the node's holder), listing
        // the accept as taken, dated no later than the offer's expires
        const receipted = (() => {
          const holder = o.refs.author, until = timeMs(termsOf(o).expires);
          // an offer may name a clock (terms.keepers, blocks.md): the accept is timely when `needed` keepers received it by expires
          const ks = keepersOf(termsOf(o).keepers), rat = ks === null ? null : receivedAt(a.hash, ks, pool);
          if (rat !== null && isStr(termsOf(o).expires) && rat <= termsOf(o).expires) return true;
          if (!isStr(holder) || until === null) return false;
          return pool.all().some(r => { const at = asList(r.refs.derives_from).includes(a.hash) ? tookAt(r, a.hash, pool) : null; return at !== null && r.state.answer.node === holder && sideOfB(r) && sideOfB(r) === sideOfB(a) && Date.parse(at) <= until; });
        })();
        if (seenStop(a) || (expires && !actedOn && !receipted && declines.some(d => d.refs.answers === a.hash && sideOfB(d) === oSide)) || !principalOk) continue;
        { const vis = pool.past(a.hash); if (!livesIn(h => vis.has(h)).includes(o)) continue; }
        // a referee's ruling reaches the accept too (promises.md, Disputes): an accept the deal's referee defeats binds nothing
        { const sides = ['from', 'to'].map(k => sideAt(k, a)).filter(isStr); if (benchOf(o.refs.schema && pool.get(o.refs.schema), sides, a).ruling(a.hash) === false) continue; }
        if (!cands.includes(a)) cands.push(a);
      }
    }
    const firsts = earliest(cands, pool);
    // two that do not see each other prove the accepter's lie, and a lie never frees its signer of what they owe: when they consent to the same
    // thing (one offer, one quantity) it binds, the lowest hash naming the accept only to name one; otherwise neither binds. Both are listed.
    const qOf = a => termsOf(a).quantity;
    const sameQ = (x, y) => (x === undefined && y === undefined) || (isObj(x) && isObj(y) && x.unit === y.unit && dec(x.value) && dec(y.value) && decCmp(x.value, y.value) === 0);
    const sameTerms = firsts.every(a => a.refs.answers === firsts[0].refs.answers && sameQ(qOf(a), qOf(firsts[0])));
    if (firsts.length > 1) forks = firsts.map(x => x.hash);
    // of crossing accepts on different terms, the one the other side's act names binds (decisions D11, E2: a lie never frees the liar, and the other
    // side's own signed act says which word it took up): a counted block of the other side's in the deal, but a decline of it, that names it among its
    // refs (a delivery's after, any ref); named by none, or several named, neither binds
    const namesIt = (x, h) => Object.entries(x.refs).some(([k, v]) => k !== 'author' && asList(v).includes(h));
    const actedBy = a => { const other = sideOfB(a) === 'from' ? 'to' : 'from'; return D.some(x => x !== a && sideOfB(x) === other && !(x.state.status === 'declined' && x.refs.answers === a.hash) && namesIt(x, a.hash)); };
    const acted = firsts.filter(actedBy);
    if (firsts.length === 1 || (firsts.length > 1 && sameTerms)) accept = firsts[0];
    else if (acted.length === 1) accept = acted[0];
    if (accept) live = pool.get(accept.refs.answers) || live;
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
        for (let j = i; j !== null; j = chain[j].parent) ended = ended || D.some(a => a.type === 'promise' && a.state.status === 'accepted' && a.refs.answers === chain[j].c.hash && opposite(chain[j].c, taker, a) && pool.sees(n.hash, a.hash));
        if (!ended) chain.push({ c: n, taker, parent: i });
      }
    }
    const takerOf = r => { const x = chain.find(y => y.c === r); return x ? x.taker : who(r); };
    const counterReq = b => chain.some(x => x.c === b);
    const requests = quoteOffer(Q) || !conditionBinds(Q) ? chain.map(x => x.c) : D.filter(b => (b.type === 'promise' && b.state.status === 'accepted' && b.refs.answers === P.hash && who(b) !== who(Q)) || counterReq(b));
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
    // in causal order (of those that do not see each other, by hash, only to list them one way)
    const allocs = D.filter(allocOf).sort((a, b) => (pool.past(a.hash).size - pool.past(b.hash).size) || byHash(a, b));
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
      if (cap && !(isObj(q) && q.unit === cap.unit)) continue;
      if (cap && floor && floor.unit === cap.unit && fcmp(frac(q.value), frac(floor.value)) < 0) continue;
      takers.push({ who: takerOf(r), request: r.hash, allocation: a.hash, quantity: q });
    }
    // allocations that pass what the offer offered, taken in causal order with the stopped ones left out, are over-allocated: the offerer's broken
    // promise to those takers. An offer with lines offers each line once, whole: every allocation after the first is over.
    {
      let running = { n: 0n, d: 1n }, one = false;
      for (const t of takers) {
        let over = false;
        if (freedBy(t)) over = false;
        else if (Array.isArray(termsOf(Q).lines)) { over = one; one = true; }
        else if (cap && isObj(t.quantity) && t.quantity.unit === cap.unit && dec(t.quantity.value) && dec(cap.value)) {
          const next = fadd(running, frac(t.quantity.value));
          if (fcmp(next, frac(cap.value)) > 0) over = true; else running = next;
        }
        t.over_allocated = over;
      }
    }
    forks = [...new Set(forks)];
    if (takers.length) accept = pool.get(takers[0].allocation);
  }
  out.takers = takers; out.forks = forks.sort();
  // the offer the binding accept answers; with none, the live offer when there is only one
  out.offer = accept ? live.hash : (lives.length === 1 ? lives[0].hash : null);
  out.live = lives.map(o => o.hash).sort();
  out.accept = accept ? accept.hash : null;
  if (accept) out.accept = accept.hash;
  // before a binding accept nothing is chosen or settled: the quantity, total, lines and paid stay empty. A block sent despite a live STOP is kept;
  // consent decides what binds: the ask is read as declined in advance (consent.md)
  if (!accept) {
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
    const withQ = takers.filter(t => t.quantity);
    const unit = offered ? offered.unit : (withQ.length ? withQ[0].quantity.unit : undefined);
    // a stopped allocation frees its quantity: the offer no longer binds it
    const amounts = withQ.filter(t => t.quantity.unit === unit && !freedBy(t)).map(t => t.quantity.value);
    if (amounts.length) out.quantity = { value: decSum(amounts), unit };
    out.over_allocated = takers.some(t => t.over_allocated === true);
    const pr = termsOf(Q).price;
    // a counter its offerer accepted binds at the counter's own price (decision H18): the total is then the price of what the requests bind plus each
    // counter's own total, in one currency (several, or a price with no total: null)
    const counterOf = t => { const r = pool.get(t.request); return r && r.state.status === undefined ? r : null; };
    const liveT = takers.filter(t => !freedBy(t));
    if (!liveT.some(counterOf)) {
      const t = totalOf(pr, out.quantity);
      if (t !== null) out.total = kindOut(t, currencyOf(pr));
    } else {
      const inUnit = t => (t.quantity && t.quantity.unit === unit ? t.quantity : undefined);
      const mine = liveT.filter(t => !counterOf(t)).map(inUnit).filter(Boolean).map(x => x.value);
      const parts = [];
      if (mine.length) parts.push({ big: totalOf(pr, { value: decSum(mine), unit }), currency: currencyOf(pr) });
      for (const t of liveT.filter(counterOf)) { const cp = termsOf(counterOf(t)).price; parts.push({ big: totalOf(cp, inUnit(t)), currency: currencyOf(cp) }); }
      if (parts.length && parts.every(x => x.big !== null) && parts.every(x => curKey(x.currency) === curKey(parts[0].currency))) out.total = kindOut(parts.reduce((s2, x) => s2 + x.big, 0n), parts[0].currency);
    }
    // only a stop of the offer itself stops it: the offerer's stop of one allocation ends that allocation's deal alone
    const ow = earliest(onward.filter(b => who(b) === who(Q) && stopsOne(b, Q.hash)), pool)[0];
    if (ow) { out.stage = 'stopped'; out.stop = 'onward'; out.from = ow.hash; out.by = sideOfB(ow) === 'from' ? 'from' : 'to'; } else out.stage = 'accepted';
    return out;
  }
  // the quantity chosen
  // the terms are those of the offer the binding accept answers (promises.md: an accept consents to the block it names)
  // a price fixed later (promises.md, Terms): read as the flat money it comes to once fixed; until then it has no total
  const fixing = fixingOf(termsOf(live), P, pool);
  const terms = fixing && fixing.fixed ? { ...termsOf(live), price: fixing.price } : termsOf(live);
  // the quantity chosen is an amount: a range is what may be chosen, not a choice (promises.md, Who may bind)
  const amountOf = q => (isObj(q) && q.value !== undefined ? q : null);
  const chosen = (takers.length === 1 ? amountOf(takers[0].quantity) : accept && accept !== P ? amountOf(termsOf(accept).quantity) : null) || amountOf(terms.quantity);
  out.quantity = chosen;
  // total: a plain money price is the whole price; a per-unit price is minor times quantity over per; lines add up
  // total: each priced line (or the whole) comes to its flat money, or money per unit times its quantity over per (in per's unit). A price whose total
  // cannot be computed (no quantity in its unit, or a per of zero) is never paid: the promise is never done, and its total is null (folds.md)
  const parts = pricedParts(terms, chosen);
  const computable = parts.every(x => x.big !== null);
  let total = null, totalBig = null;
  let totalKind;
  if (computable && parts.length) { totalBig = sumOwn(parts); totalKind = parts[0].currency; total = kindOut(totalBig, totalKind); }
  out.total = total;
  out.price_fixed = fixing ? fixing.fixed : null;
  // ---- what is owed (promises.md, Owed): what each side is owed, and the hand-overs of it
  // The `to` side is owed what moves, the `from` side the price. The price what is owed of the price is a part of is what the terms come to at the
  // quantity chosen. A side that names a thing is Bearer's, never read here.
  const owedTotal = fixing || (total && isObj(totalKind) && totalKind.goods !== undefined) ? null : totalBig, owedCur = total ? totalKind : null;
  const owedSide = k => { const r = Q.refs[k]; if (self || (r !== undefined && r !== '' && isThing(r))) return null; const w = sideAt(k, accept); return isStr(w) && w !== '' ? w : null; };
  const owedCands = (terms.personal === true || self) ? [] : pool.all().filter(t => t.type === 'transfer' && asList(t.refs.what).includes(P.hash) && t.state.status === undefined && t.refs.to_owner !== undefined && t.state.amount === undefined && counts(t, pool) && pool.sees(t.hash, accept.hash));
  const owedActive = owedCands.length > 0;
  const portion = (o, w) => { const e = o.price.find(x => x[0] === w); return e ? e[1] : 0n; };
  const owedInitial = () => { const f = owedSide('from'); return { noun: owedSide('to'), price: f !== null && owedTotal !== null && owedTotal > 0n ? [[f, owedTotal]] : [], moves: [], applied: [], forked: [] }; };
  const owedMemo = new Map();
  const owedAccepted = (t, vis) => pool.all().some(a => a.type === 'transfer' && a.state.status === 'accepted' && vis(a.hash) && counts(a, pool) && asList(a.refs.answers).includes(t.hash) && asList(t.refs.to_owner).includes(who(a)) && answerStands(t, a, pool));
  const owedMoney = t => { const m = t.state.money; if (!isObj(m) || curKey(m.currency) !== curKey(owedCur)) return 0n; return BigInt(m.minor); };
  // the hand-overs vis lets in, each counting when its new owner's accept is in what acc lets in (an owner who handed what is owed on and signs another
  // sees it gone once the first is accepted, as the ownership fold reads a chain of transfers)
  const owedRead = (vis, acc, key) => {
    if (!owedActive) return owedInitial();
    if (owedMemo.has(key)) return owedMemo.get(key);
    const valid = [];
    for (const t of owedCands.filter(x => vis(x.hash))) {
      if (!owedAccepted(t, acc)) continue;
      if (t.state.condition !== undefined && !(conditionHolds1(t, pool, vis, '') && !letGo(t, pool, vis))) continue;
      const signer = who(t);
      if (!isStr(signer)) continue;
      const before = owedBefore(t, acc, key);
      const holds = t.state.money !== undefined ? portion(before, signer) > 0n : (before.noun === signer || portion(before, signer) > 0n);
      if (holds) valid.push({ t, signer, before });
    }
    // two hand-overs by one owner that do not see each other are a fork: neither moves it
    const forked = valid.filter(a => valid.some(b => b.t !== a.t && b.signer === a.signer && !pool.sees(a.t.hash, b.t.hash) && !pool.sees(b.t.hash, a.t.hash))).map(a => a.t.hash);
    const sorted = valid.filter(a => !forked.includes(a.t.hash)).sort((a, b) => (pool.past(a.t.hash).size - pool.past(b.t.hash).size) || byHash(a.t, b.t));
    const o = owedInitial();
    const add = (w, d) => { const e = o.price.find(x => x[0] === w); if (e) e[1] += d; else o.price.push([w, d]); };
    for (const { t, signer, before } of sorted) {
      const nw = asList(t.refs.to_owner)[0];
      o.applied.push(t.hash);
      let amount;
      if (t.state.money !== undefined) { const m = owedMoney(t), have = portion(before, signer); amount = m < have ? m : have; }
      else { if (before.noun === signer) o.noun = nw; amount = portion(before, signer); }
      if (amount > 0n && nw !== signer) { add(signer, -amount); add(nw, amount); o.moves.push([t.hash, signer, nw, amount]); }
    }
    o.price = o.price.filter(x => x[1] > 0n).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    o.forked = forked;
    owedMemo.set(key, o);
    return o;
  };
  // what was owed where a hand-over stands: its causal past without it
  const owedBefore = (t, acc, key) => { const past = pool.past(t.hash); return owedRead(h => past.has(h) && h !== t.hash, acc, key + ' before ' + t.hash); };
  // what is owed as a block sees it, and once every hand-over held is read
  const owedSeenBy = b => { const past = pool.past(b.hash); const v = h => past.has(h); return owedRead(v, v, 'seen ' + b.hash); };
  const owedLatest = () => owedRead(() => true, () => true, 'latest');
  // ---- settling: counted blocks made for P
  // the deal's schema is the bound offer's own (promises.md: once a counter binds, the deal's terms are the counter's own, whole)
  const schema = live.refs.schema && pool.get(live.refs.schema);
  // a block confirms or defeats only if its author is named: an id, or a holder of circle#role in the circle's fold of that block's causal past
  // a confirmer is one the deal's schema names in its grounds; no caller adds one (a stage is a function of the blocks alone)
  // a side of the deal, or a role inside a side's circle, is never its confirmer or its referee (invariant 13): such a name adds nothing
  const openName = sideOfB(Q) === 'from' ? 'to' : 'from';
  const receiverAtTie = k => { const r = sideAt(k, accept); return isStr(r) ? r : k === openName ? ((takers[0] && isStr(takers[0].who) && takers[0].who) || accept.refs.author) : undefined; };
  const dealSides = ['from', 'to'].map(receiverAtTie).filter(isStr);
  const bench = benchOf(schema, dealSides, accept);
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
  const settling = D.filter(b => !defeated(b.hash) && b.refs.answers === undefined && b.hash !== P.hash && b.type !== 'promise' && asList(b.refs.for).includes(P.hash) && sideOfB(b));
  // who a side is where a block stands; an open side is the taker, or the accepter
  const otherName = sideOfB(Q) === 'from' ? 'to' : 'from';
  const receiverAt = (side, b) => { const r = sideAt(side, b); if (isStr(r)) return r; return side === otherName ? ((takers[0] && isStr(takers[0].who) && takers[0].who) || accept.refs.author) : undefined; };
  // a transfer to a side counts once that side answers it accepted (the side read where its answer stands), or a named confirmer confirms it
  // who may answer b for the right of a side: once what is owed has been handed over, the owner of that right where b stands; else the side where the answer stands
  const rcvs = (side, b, a, rights) => {
    if (rights && owedActive) {
      const o = owedSeenBy(b);
      if (side === 'to') { if (o.noun !== null && o.noun !== undefined) return [o.noun]; } else if (o.price.length) return o.price.map(x => x[0]);
    }
    const r = receiverAt(side, a);
    return isStr(r) ? [r] : [];
  };
  const answersTo = (b, side, rights) => standingAnswer(b, a => rcvs(side, b, a, rights).some(r => who(a) === r && asList(b.refs.to_owner).includes(r)));
  const countedTo = (b, side, rights) => answersTo(b, side, rights).length > 0 || (rcvs(side, b, b, rights).some(r => asList(b.refs.to_owner).includes(r)) && confirmed(b.hash));
  // a goods transfer moves an instance toward a line only when the instance is of the line's what (the thing itself, or one whose refs.of names it)
  // and its giver owned it where the transfer stands (the ownership fold of the transfer's causal past). Each whole instance counts once toward a line.
  const ofLine = (h, what) => { const t = pool.get(h), whats = asList(what); return !!t && t.type === 'thing' && (whats.includes(h) || asList(t.refs.of).some(k => whats.includes(k))); };
  const movedBy = (h, t) => isStr(who(t)) && ownershipFold(h, pool, pool.past(t.hash)).owner === who(t);
  const goods = [], pays = [], refunds = [], works = [];
  for (const b of settling) {
    if (b.type === 'transfer') {
      const money = b.state.money !== undefined;
      if (!money) {
        // goods are the giver's (the from side's): to the to side's ownership, accepted by it or confirmed; or, with an open receiver (an
        // allocation's deal: state.count, no to_owner), on the offerer's word alone (folds.md, stage 2). A loan (to_holder) settles no sale.
        // A payment in goods (promises.md, Settling): the paying side's transfer of goods it owned, `for` this deal alone, with an amount, to the
        // side that is paid, who accepted it. It counts toward a price of that kind, or at what the payee's accepted answer says it covers.
        if (sideOfB(b) === 'to') {
          if (asList(b.refs.for).length === 1 && b.state.amount !== undefined && asList(b.refs.what).length && asList(b.refs.what).every(h => movedBy(h, b)) &&
            (b.state.condition === undefined || conditionStands(b, pool, () => true, '')) && countedTo(b, 'from', true)) pays.push(b);
          continue;
        }
        if (sideOfB(b) !== 'from') continue;
        // a transfer that moves no instance of any line's what that its giver owned is no delivery at all
        const lineWhats = Array.isArray(terms.lines) ? terms.lines.map(l => l.what) : [live.refs.what !== undefined ? live.refs.what : Q.refs.what];
        if (!asList(b.refs.what).some(h => lineWhats.some(w => ofLine(h, w)) && movedBy(h, b))) continue;
        if (b.state.condition !== undefined && !conditionStands(b, pool, () => true, '')) continue;
        const counted = b.state.count !== undefined && b.refs.to_owner === undefined && Q.refs.to === undefined && sideOfB(Q) === 'from' && counts(b, pool);
        if (countedTo(b, 'to', true) || counted) goods.push(b);
        continue;
      }
      // a payment for several promises pays each only by its split: with none, it pays none of them (things.md, Transfers)
      if (asList(b.refs.for).length > 1 && !Array.isArray(b.state.split)) continue;
      // a payment speaks for the paying side (to) and goes to the from side; a refund speaks for the from side and goes back to the to side; no one
      // pays, or refunds, by another's hand (folds.md, stage 1)
      if (sideOfB(b) === 'to' && countedTo(b, 'from', true)) pays.push(b);
      else if (sideOfB(b) === 'from' && countedTo(b, 'to', false)) refunds.push(b);
    } else if (b.type === 'observe' && b.state.kind === 'work') {
      const receiver = sideAt(sideOfB(b) === 'from' ? 'to' : 'from', b);
      if (owedActive ? standingAnswer(b, a => rcvs('to', b, a, true).includes(who(a))).length > 0 : accepted(b, receiver)) works.push(b);
      else if (confirmed(b.hash)) works.push(b);
    } else if (b.type === 'transform') {
      if (accepted(b) || confirmed(b.hash)) goods.push(b);
    }
  }
  // what a payment with no split covers is the word of the side it is paid to (promises.md, Settling): each of that side's accepted answers that
  // counts it says so in state.covers, else it covers its own money; one a named confirmer counted covers its own money. Of several, her latest
  // word in causal order counts (promises.md, Settling); several that do not see each other say nothing of what it covers. Never less than the money.
  const ownValue = b => (b.state.money !== undefined ? b.state.money : b.state.amount);
  const coveredBy = (b, side) => {
    const as = answersTo(b, side, side === 'from');
    const last = latest(as, pool);
    return last.length === 1 && last[0].state.covers !== undefined ? [last[0].state.covers] : [ownValue(b)];
  };
  // the currency the promise is paid in: the price's; with no price, the one currency every counted payment covers (several: none)
  const splitCur = b => { const parts = b.state.split.filter(x => isObj(x) && x.for === P.hash); return parts.length && isObj(parts[0].money) ? parts[0].money.currency : null; };
  const paidCurs = [...new Map(pays.flatMap(b => (Array.isArray(b.state.split) ? [splitCur(b)] : coveredBy(b, 'from').map(m => (isObj(m) && kindOfValue(m) !== undefined ? kindOfValue(m) : null)))).map(c => [curKey(c), c])).values()];
  const ownCur = total ? totalKind : (paidCurs.length === 1 ? paidCurs[0] : undefined);
  const sameCur = m => isObj(m) && kindOfValue(m) !== undefined && curKey(kindOfValue(m)) === curKey(ownCur);
  const putToward = (b, side) => {
    if (Array.isArray(b.state.split)) return b.state.split.filter(x => isObj(x) && x.for === P.hash).map(x => x.money).filter(sameCur).reduce((s, m) => s + BigInt(m.minor), 0n);
    // her word only raises it: money that moved counts in full in its own currency, whatever covers says (promises.md, Settling)
    return [ownValue(b), ...coveredBy(b, side)].filter(sameCur).reduce((mx, m) => (bigOfValue(m) > mx ? bigOfValue(m) : mx), 0n);
  };
  const sentFor = b => {
    if (Array.isArray(b.state.split)) return b.state.split.filter(x => isObj(x) && x.for === P.hash).map(x => x.money).filter(sameCur).reduce((s, m) => s + BigInt(m.minor), 0n);
    return sameCur(ownValue(b)) ? bigOfValue(ownValue(b)) : 0n;
  };
  const sentBig = pays.reduce((s, b) => s + sentFor(b), 0n);
  // a part of the price handed to the one who owes it is paid, with no money moved
  const payer = receiverAt('to', accept);
  const setoff = owedActive && isStr(payer) ? portion(owedLatest(), payer) : 0n;
  const paidBig = pays.reduce((s, b) => s + putToward(b, 'from'), 0n) + setoff;
  const refundedBig = refunds.reduce((s, b) => s + putToward(b, 'to'), 0n);
  if ((pays.length || setoff > 0n) && (total || (ownCur !== undefined && ownCur !== null))) out.paid = kindOut(paidBig, ownCur);
  // what moves (promises.md): the offer's own refs.what, else the first promise's (a counter need not name it again)
  const whatRef = live.refs.what !== undefined ? live.refs.what : Q.refs.what;
  // lines: how much of each line the counted transfers moved
  const lineSpecs = Array.isArray(terms.lines) ? terms.lines.map(l => ({ id: l.id, what: l.what, unit: l.quantity && l.quantity.unit, needed: l.quantity ? decNum(l.quantity) : null, exact: l.quantity ? frac(l.quantity.value) : null, per: isObj(l.price) && perUnit(l.price) })) :
    (whatRef !== undefined ? [{ id: null, what: whatRef, unit: chosen ? chosen.unit : (terms.quantity && terms.quantity.unit), needed: chosen ? decNum(chosen) : (isObj(terms.quantity) && terms.quantity.value !== undefined ? decNum(terms.quantity) : null),
      exact: chosen ? frac(chosen.value) : (isObj(terms.quantity) && terms.quantity.value !== undefined ? frac(terms.quantity.value) : null), per: isObj(terms.price) && perUnit(terms.price) }] : []);
  // catch weight (promises.md, Terms): under a per-unit price, terms.band is how far what is delivered may fall from the quantity chosen, either way, as
  // a fraction of it. What the receiver accepted inside the band covers the line and is what is priced; outside it the quantity chosen is priced, and
  // less than the band's bottom does not cover the line.
  const band = isStr(terms.band) && dec(terms.band) ? frac(terms.band) : null;
  const fmul = (a, b) => ({ n: a.n * b.n, d: a.d * b.d });
  const isWork = whatRef === undefined && Q.state.what !== undefined;
  const lineInfo = [];
  for (const l of lineSpecs) {
    // how much counted transfers moved, exactly, in the line's unit: an amount or a pack in another unit moves nothing; a transfer with no amount and no
    // pack is a whole instance, which covers the line
    let whole = false, any = false, exact = { n: 0n, d: 1n };
    const once = new Set();
    for (const t of goods) {
      if (l.id !== null && t.state.line !== l.id) continue;
      const instances = asList(t.refs.what).filter(h => ofLine(h, l.what) && movedBy(h, t));
      if (!instances.length) continue;
      if (t.state.amount !== undefined) { any = true; if (isObj(t.state.amount) && t.state.amount.unit === l.unit && l.unit !== undefined) exact = fadd(exact, frac(t.state.amount.value)); continue; }
      const fresh = instances.filter(h => !once.has(h));
      fresh.forEach(h => once.add(h));
      if (!fresh.length) continue;
      any = true;
      const packs = fresh.map(h => pool.get(h)).filter(x => x && isObj(x.state.pack)).map(x => x.state.pack);
      if (!packs.length) whole = true;
      for (const p of packs) if (p.unit === l.unit && l.unit !== undefined) exact = fadd(exact, frac(p.value));
    }
    let least = l.exact, inside = null;
    if (band && l.per && l.exact !== null && !whole) {
      const lo = fmul(l.exact, { n: band.d - band.n, d: band.d }), hi = fmul(l.exact, { n: band.d + band.n, d: band.d });
      least = lo;
      if (fcmp(exact, lo) >= 0 && fcmp(exact, hi) <= 0) inside = exact;
    }
    const coveredLine = l.exact === null ? any : (whole || fcmp(exact, least) >= 0);
    // capped at what is needed only when a whole instance covers the line; a line with no quantity needs one counted transfer of its thing
    // (promises.md, Settling): how much it moved is then not a number
    const moved = l.exact === null ? (any ? null : 0) : whole ? l.needed : fracNum(exact);
    out.lines.push({ id: l.id, needed: l.needed, moved, any, coveredLine, inside });
    lineInfo.push({ whole, any, exact, least });
  }
  // inside a band, a line is priced on what moved (an exact decimal: every denominator here is a power of ten)
  const fracText = f => { const k = f.d.toString().length - 1, a = f.n < 0n ? -f.n : f.n; const t = k ? ((a / f.d).toString() + '.' + (a % f.d).toString().padStart(k, '0')).replace(/0+$/, '').replace(/\.$/, '') : a.toString(); return (f.n < 0n ? '-' : '') + t; };
  const insides = out.lines.map(x => x.inside);
  if (insides.some(x => x)) {
    const qtyFor = (i, q) => (insides[i] && isObj(q) ? { value: fracText(insides[i]), unit: q.unit } : q);
    const parts2 = pricedParts(terms, chosen, qtyFor);
    if (computable && parts2.length && parts2.every(x => x.big !== null)) { totalBig = sumOwn(parts2); total = kindOut(totalBig, parts2[0].currency); out.total = total; }
  }
  let covered = false;
  if (lineSpecs.length) covered = out.lines.every(l => l.coveredLine);
  else if (isWork) {
    // accepted work covers the quantity accepted (not the offer's range); one accepted work block is enough when none was chosen (folds.md, stage 2)
    if (chosen) covered = fcmp(fsum(works.filter(w => w.state.amount && w.state.amount.unit === chosen.unit).map(w => w.state.amount.value)), frac(chosen.value)) >= 0;
    else covered = works.length > 0;
  }
  out.lines = out.lines.map(({ id, needed, moved }) => ({ id, needed, moved }));
  // what was paid for the deal and never covered by what moved (folds.md, Uncovered): the money sent, less what was paid back, less the price of
  // what moved, less what the terms say is kept (forfeit). Owed back to the payer, shown as a fact; null when nothing was sent. The price of what moved
  // is prorated only by a signed per-unit price or a line's price; on a flat price for a whole, nothing is covered until the whole moves.
  const uncoveredFact = () => {
    if (ownCur === undefined || ownCur === null || sentBig <= 0n) return null;
    let value = 0n;
    if (!(terms.refrain === true)) {
      if (lineSpecs.length) {
        lineSpecs.forEach((l, i) => {
          const info = lineInfo[i];
          const lineTerms = Array.isArray(terms.lines) ? terms.lines[i] : { price: terms.price, quantity: chosen };
          if (!isObj(lineTerms.price) || l.what === undefined || l.what === null) return;
          const qty = insides[i] && isObj(lineTerms.quantity) ? { value: fracText(insides[i]), unit: lineTerms.quantity.unit } : lineTerms.quantity;
          const full = totalOf(lineTerms.price, qty);
          if (full === null || curKey(currencyOf(lineTerms.price)) !== curKey(ownCur)) return;
          if (info.whole || (info.any && l.exact === null)) value += full;
          else if (l.exact === null) value += 0n;
          else if (fcmp(info.exact, info.least) >= 0) value += full;
          else if (l.per) { const part = totalOf(lineTerms.price, { value: fracText(info.exact), unit: lineTerms.quantity.unit }); if (part !== null) value += part; }
          else {
            // a flat price for a whole: nothing is covered until the whole moves, except what the payer's own accepted answer to a delivery says it
            // covers (promises.md, Settling): her word lowers only what she is owed back
            let said = 0n;
            for (const t of goods) {
              if (l.id !== null && t.state.line !== l.id) continue;
              if (!asList(t.refs.what).some(h => ofLine(h, l.what) && movedBy(h, t))) continue;
              for (const m of coveredBy(t, 'to')) if (sameCur(m)) said += bigOfValue(m);
            }
            value += said > full ? full : said;
          }
        });
      } else if (isObj(terms.price) && perUnit(terms.price)) {
        // a job or time promise at a price per unit: the accepted work, in that unit
        const unit = terms.price.per.unit;
        const worked = fsum(works.filter(w => isObj(w.state.amount) && w.state.amount.unit === unit).map(w => w.state.amount.value));
        const part = totalOf(terms.price, { value: fracText(worked), unit });
        if (part !== null && curKey(currencyOf(terms.price)) === curKey(ownCur)) value += part;
      } else {
        const workDone = chosen ? fcmp(fsum(works.filter(w => w.state.amount && w.state.amount.unit === chosen.unit).map(w => w.state.amount.value)), frac(chosen.value)) >= 0 : works.length > 0;
        if (workDone && total && curKey(totalKind) === curKey(ownCur)) value += totalBig;
      }
    }
    const kept = isObj(terms.forfeit) && curKey(terms.forfeit.currency) === curKey(ownCur) ? BigInt(terms.forfeit.minor) : 0n;
    let left = sentBig - refundedBig - value - kept;
    if (left < 0n) left = 0n;
    return kindOut(left, ownCur);
  };
  // what is owed, and by the hand-overs of it (promises.md, Owed): null until one counted
  if (owedActive) {
    const o = owedLatest();
    if (o.applied.length || o.forked.length) out.owed = { to: o.noun === undefined ? null : o.noun, from: o.price.map(([w, d]) => ({ owner: w, money: { minor: minorOut(d), currency: ownCur === undefined ? null : ownCur } })), forked: [...o.forked].sort() };
    // a payment made to an owner who had already handed that part of what is owed on, without seeing it, counts; the old owner holds that amount for
    // the new one: [{ from, to, money, payment }]
    const owedOn = [];
    for (const x of pays) {
      const owners = owedSeenBy(x).price.map(e => e[0]);
      const owner = asList(x.refs.to_owner).find(w => owners.includes(w));
      if (owner === undefined || !isObj(x.state.money)) continue;
      const cur = x.state.money.currency;
      let left = Array.isArray(x.state.split) ? x.state.split.filter(e => isObj(e) && e.for === P.hash && isObj(e.money) && curKey(e.money.currency) === curKey(cur)).reduce((t, e) => t + BigInt(e.money.minor), 0n) : BigInt(x.state.money.minor);
      for (const [th, from, to, amount] of o.moves) {
        if (from !== owner || pool.sees(x.hash, th)) continue;
        const held = left < amount ? left : amount;
        if (held > 0n) { owedOn.push({ key: x.hash, to, v: { from: owner, to, money: { minor: minorOut(held), currency: cur }, payment: x.hash } }); left -= held; }
      }
    }
    out.owed_on = owedOn.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.to < b.to ? -1 : a.to > b.to ? 1 : 0)).map(e => e.v);
  }
  // a message with a receipt (promises.md, Settling): each counted observe of kind message a side wrote for the deal, with the time the named clock received
  // it (the promise's keepers and no one else's receipt); null while there is no clock or no receipt
  out.received_at = pool.all().filter(o => o.type === 'observe' && o.state.kind === 'message' && asList(o.refs.for).includes(P.hash) && counts(o, pool) && sideOfB(o)).sort(byHash).map(o => {
    const side = sideOfB(o), ks = keepersOf(terms.keepers);
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
  const paidAll = computable && (total === null || paidBig >= totalBig);
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
  const handedDates = setoff > 0n ? owedLatest().moves.filter(m => m[2] === payer).map(m => pool.all().filter(a => a.type === 'transfer' && a.state.status === 'accepted' && asList(a.refs.answers).includes(m[0])).map(a => a.state.at).filter(isStr).sort()[0]).filter(isStr) : [];
  const payDates = [...pays.map(countedAt), ...handedDates].filter(isStr).sort();
  out.paid_at = !standing && paidAll && total !== null && (pays.length || setoff > 0n) && paidBig > 0n && payDates.length ? payDates[payDates.length - 1] : null;
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
        (byList.some(n => n === o.refs.author || (n.includes('#') && membersThen(o, n, pool).includes(o.refs.author))) || (o.refs.as !== undefined && byList.includes(o.refs.as))) : false))) : [];
    // the wait runs from the named clock's receipt of the event (blocks.md), never from its own `at`: the promise's keepers and no one else
    const kclock = keepersOf(terms.keepers);
    // the occurrences a payment names: a lone state.occurrence, or in a split the occurrence of each part for this deal (a part with none reads the payment's own)
    const occOf = b => (Array.isArray(b.state.split) ? b.state.split.filter(x => isObj(x) && x.for === P.hash).map(x => (isStr(x.occurrence) ? x.occurrence : b.state.occurrence)).filter(isStr) : isStr(b.state.occurrence) ? [b.state.occurrence] : []);
    const sumFor = (b, name) => (Array.isArray(b.state.split) ? b.state.split.filter(x => isObj(x) && x.for === P.hash && (isStr(x.occurrence) ? x.occurrence : b.state.occurrence) === name).map(x => x.money).filter(sameCur).reduce((s, m) => s + BigInt(m.minor), 0n) : putToward(b, 'from'));
    const names = [...new Set([...pays.flatMap(occOf), ...events.map(o => o.hash)])].sort();
    for (const name of names) {
      const ev = events.find(o => o.hash === name);
      const rcv = ev && kclock ? receivedAt(ev.hash, kclock, pool) : null;
      const due = ev ? (isStr(rcv) ? (wait ? addDur(rcv, wait) : rcv) : null) : (timeProblem(name) === null && !RX.hash.test(name) ? name : null);
      const mine = pays.filter(b => occOf(b).includes(name));
      const sum = mine.reduce((t, b) => t + sumFor(b, name), 0n);
      const paid = !mine.length || (total === null && (ownCur === undefined || ownCur === null)) ? null : kindOut(sum, ownCur);
      const covered = totalBig !== null && sum >= totalBig && sum > 0n;
      const dates = covered ? mine.map(countedAt).filter(isStr).sort() : [];
      out.occurrences.push({ occurrence: name, due: due === undefined ? null : due, paid, paid_at: dates.length ? dates[dates.length - 1] : null });
    }
  }
  // a side's defeats of the deal's head (its first promise, its root, or the offer the binding accept answers), or of a block in the deal that speaks
  // for the other side (a delivery, a payment, work), changes nothing: it is shown as disputed, by that side, on the date it gives (promises.md,
  // Disputes). A side's defeats of its own act is no dispute.
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
  // a refrain (promises.md) moves nothing: never done in the fold. It is breached by a counted defeats of the deal's head (its first promise, or the
  // offer accepted) by the deal's referee (a confirmer its schema names), saying it happened (its when: an instant, or a range's from; else its at)
  // at or before until, and not taken back by the referee; or when its own condition, a signal, holds at its until. The side it was made to only
  // disputes.
  const refrain = terms.refrain === true;
  if (refrain) covered = false;
  // a standing promise (a repeat) is done occurrence by occurrence, never as a whole: underway until a stop or a close ends it (folds.md)
  if (terms.repeat !== undefined) covered = false;
  const happened = c => (isStr(c.state.when) ? c.state.when : isObj(c.state.when) && isStr(c.state.when.from) ? c.state.when.from : c.state.at);
  // each name's breaches: its defeats of the head within the term that it has not taken back itself; as many names as are needed breach it (a chain: the
  // first name in turn that has)
  const breachesBy = ([n, since]) => pool.all().filter(c => asList(c.refs.defeats).some(h => h === P.hash || h === live.hash) && bench.holdsName(c, n) &&
    datedFrom(c, since) &&
    isStr(happened(c)) && isStr(terms.until) && happened(c) <= terms.until && bench.voice(n, c.hash) !== false).map(c => c.hash);
  const byName = refrain ? bench.turn(P.hash, () => [...new Set([P.hash, live.hash])].flatMap(disputesOf)).map(breachesBy).filter(x => x.length) : [];
  const enough = bench.wait ? byName.length > 0 : quorum(byName, bench.needed);
  const breaches = enough ? byName.flat().sort() : [];
  const signalled = refrain && isObj(terms.condition) && terms.condition.signal !== undefined && isStr(terms.until) && conditionHolds(terms.condition, pool, terms.until) === true;
  const anySettling = goods.length + pays.length + works.length > 0;
  // ---- onward stop and occurrences
  const occ = new Set();
  for (const b of D) if (b.type === 'promise' && b.state.status === 'stopped' && isObj(b.state.stop) && Array.isArray(b.state.stop.occurrences) && sideOfB(b)) b.state.stop.occurrences.forEach(o => occ.add(o));
  out.stopped = [...occ].sort();
  // ---- the stage: the first of these that holds, from the furthest along back to the start (with no binding accept, above)
  if (covered && paidAll && paidBig > 0n && refundedBig >= paidBig) out.stage = 'reversed';
  else if (covered && paidAll) out.stage = 'done';
  else if (breaches.length) { out.stage = 'breached'; out.from = breaches[0]; out.uncovered = uncoveredFact(); }
  else if (signalled) { out.stage = 'breached'; out.uncovered = uncoveredFact(); }
  else if (refrain && paidBig > 0n && refundedBig >= paidBig) out.stage = 'reversed'; // a refrain paid and paid back: neither kept nor broken
  else if (onwardFirst) {
    // of first stops that do not see each other, speaking for both sides, by is both: no hash decides it (folds.md, stage 4). A death ends no
    // promise (profiles/successor.md): only a stop does.
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
const stageBinds = s => !!s && (['accepted', 'underway', 'done', 'reversed', 'breached'].includes(s.stage) || (s.stage === 'stopped' && s.stop === 'onward'));
function promiseView(first, blocks, opts) {
  const v = promiseViewBase(first, blocks, opts);
  if (!v) return v;
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
    const ended = ['declined', 'expired'].includes(tv.stage) || (tv.stage === 'stopped' && (tv.stop === 'before' || key !== 'accepted')) || (tv.stage === 'breached' && key !== 'accepted');
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
  // with the reader's arrivals, every block is read as the recovery reach view reads it (decision c9)
  if (opts && isObj(opts.arrivals)) { const p = new Pool([first, ...poolOf(blocks).all()]); p.arrivals = opts.arrivals; blocks = p; }
  const s = promiseStage(first, blocks);
  if (!s) return null;
  const pool = new Pool([first, ...poolOf(blocks).all()]);
  // expired once every live offer has an expires the reader's clock has passed (one still open could bind)
  const past = s.live.length && s.live.every(h => { const o = pool.get(h), exp = o && termsOf(o).expires; return exp && opts && opts.now !== undefined && opts.now > exp; });
  if ((s.stage === 'offered' || s.stage === 'asked') && past) return { ...s, stage: 'expired' };
  // a refrain accepted or underway is elapsed once the reader's clock passes its until (folds.md, Views; decision H15): its term ran with no referee's
  // defeat counted, a fact, never a verdict that it was kept; what was paid is beside it
  const o = pool.get(s.offer), t = o ? termsOf(o) : {};
  // one a stop ended stays stopped: when the stop came, against the until, is a fact for each reader to judge
  const running = s.stage === 'accepted' || s.stage === 'underway';
  if (running && t.refrain === true && t.until !== undefined && opts && opts.now !== undefined && opts.now > t.until) {
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

// ================================================================ ownership and place (folds.md)
// principalOf(block): the circle the block was signed `as` (when its signer may sign for it), else its author; for a grant, its grantor
function principalOf(b, pool) { return b.refs.as !== undefined ? (mayActAsIn(b, b.refs.as, pool) ? b.refs.as : null) : b.refs.author; }
// who a block speaks for (folds.md, Who a block speaks for): one party. A block that names a circle in `as` speaks for it when its author may
// sign for it, else for no one; a block under a live grant made for its receiver speaks for the grantor (a promise outside the grant's scope is
// a quote request and still does; any other block outside it speaks for its author); any other block speaks for its author.
function speakerOf(b, pool) {
  const key = 'spk:' + b.hash, mine = pool.get(b.hash) === b;
  if (mine && pool.memo.has(key)) return pool.memo.get(key);
  const out = speakerNow(b, pool);
  if (mine) pool.memo.set(key, out);
  return out;
}
// under a grant: the block passes the door's whole authority test (whyNotUnder), or it is a promise with no status under a live grant made for its
// author, which is a quote request (promises.md)
function speakerNow(b, pool) {
  const g = b.refs.as === undefined && b.refs.under !== undefined ? pool.get(b.refs.under) : null;
  if (g && g.type === 'grant' && grantLive(g, pool, new Set(), b) && receives(g, b, pool) && ((b.type === 'promise' && b.state.status === undefined) || !whyNotUnder(b, pool).length)) return principalOf(g, pool);
  return principalOf(b, pool);
}
// whether a receiver's accepted answer to a transfer still counts (things.md, Transfers): a transfer to a named receiver is read like an offer. The
// giver's withdrawal (their own updates of it, stopped with before) voids an accept that has it in its causal past; on a transfer that carried
// expires, the giver's declined answer to the accept voids it
function answerStands(t, a, pool) {
  const giver = speakerOf(t, pool);
  return !pool.all().some(w => w.type === 'transfer' && counts(w, pool) && giver !== null && speakerOf(w, pool) === giver &&
    ((w.state.status === 'stopped' && w.state.stop === 'before' && w.refs.updates === t.hash && pool.sees(a.hash, w.hash)) ||
     (t.state.expires !== undefined && w.state.status === 'declined' && w.refs.answers === a.hash)));
}
// the blocks held, and the thing itself when it is not among them (a thing given whole is read with the blocks)
const withThing = (thingIn, blocks) => { const held = poolOf(blocks); return typeof thingIn === 'string' || held.get(thingIn.hash) ? held : new Pool([thingIn, ...held.all()]); };
// within: the hashes it reads (a block's causal past), each block read as it is among all held; left out, all
function ownershipFold(thingIn, blocks, within, now = '') {
  const pool = withThing(thingIn, blocks);
  const thing = pool.get(typeof thingIn === 'string' ? thingIn : thingIn.hash);
  const seen = h => !within || within.has(h);
  if (!thing || !seen(thing.hash)) return { owner: null, transfers: [], conflict: null }; // an instance that rests on blocks not held is not read yet
  if (thing.type === 'actor') return { owner: null, transfers: [], conflict: null }; // nothing reaches a person: no word makes an actor property (core.md, section 11)
  const speaker = b => speakerOf(b, pool);
  const maker = speaker(thing); // a thing made `as` a circle is the circle's (folds.md, Who a block speaks for)
  const named = t => t.refs.to_owner !== undefined;
  // a fork voids what the forker claims, never what they owe (folds.md, A fork is a burden): a transfer to a named receiver who accepted it stands though
  // its giver forked; goods moved to an open receiver on the giver's word alone do not
  const owed = t => named(t) && forkedOnly(t, pool);
  const transfers = pool.all().filter(t => t.type === 'transfer' && seen(t.hash) && t.refs.answers === undefined && asList(t.refs.what).includes(thing.hash) && t.state.amount === undefined && (named(t) || t.state.count !== undefined) && (counts(t, pool) || owed(t)) &&
    // a transfer that carries a condition counts once it holds at the reader's clock, and unless its receiver let it go (things.md, Transfers)
    (t.state.condition === undefined || (conditionHolds1(t, pool, seen, now) && !letGo(t, pool, seen))));
  const accepted = t => !named(t) || pool.all().some(a => a.refs.answers === t.hash && seen(a.hash) && a.state.status === 'accepted' && speaker(a) === t.refs.to_owner && counts(a, pool) && answerStands(t, a, pool));
  // a kind has no owner (things.md, Things): a thing some counted thing names in refs.of is a description; its instances have owners
  if (pool.all().some(b => seen(b.hash) && asList(b.refs.of).includes(thing.hash) && counts(b, pool))) return { owner: null, transfers: [], conflict: null };
  // an idea is not property (things.md, Things): a thing is owned only once its own record shows it is an instance: it names its kind (refs.of), it was made
  // (refs.derives_from), or it names what it is part of or where it is (refs.subject, refs.place)
  const showsInstance = ['of', 'derives_from', 'subject', 'place'].some(k => asList(thing.refs[k]).length > 0);
  if (!showsInstance) return { owner: null, transfers: [], conflict: null };
  let owner = maker, prev = null, conflict = null;
  // produce of a thing (things.md): what a keep makes belongs first to the owner of the thing kept, where the keep stands; only when exactly one such keep is among the output's derives_from
  if (thing.type === 'thing') {
    const keeps = asList(thing.refs.derives_from).map(h => pool.get(h)).filter(k => k && k.type === 'transform' && seen(k.hash) && k.refs.derives_from === undefined && isStr(k.refs.subject) && counts(k, pool));
    if (keeps.length === 1) {
      const means = pool.get(keeps[0].refs.subject);
      if (means && means.type === 'thing') { const past = pool.past(keeps[0].hash); const o = ownershipFold(means, pool, new Set([...past].filter(h => seen(h)))).owner; if (o !== null) owner = o; }
    }
  }
  const list = [];
  for (;;) {
    const elig = transfers.filter(t => speaker(t) === owner && accepted(t) && (prev ? pool.sees(t.hash, prev.hash) : true) && t !== prev && !list.includes(t));
    if (!elig.length) break;
    // the next counted transfer is the earliest of those the owner signed: two that do not see each other prove a lie
    let first = earliest(elig, pool);
    // after a death recorded under her own successor grant, the person's own gift that crosses what her successor gave under that grant moves nothing
    // (decision E7): her gift has a trigger under the grant in its causal past, and her successor's transfer counts as hers; giving away what her own
    // word may already have passed on is her broken promise to her receiver, never a cloud on the buyer's title. A gift that saw no trigger still crosses.
    if (first.length > 1) { const kept = first.filter(t => !yieldsToSuccessor(t, first, pool)); if (kept.length) first = kept; }
    if (first.length > 1) { conflict = first.map(t => t.hash); break; }
    const t = first[0];
    list.push(t); prev = t;
    owner = named(t) ? t.refs.to_owner : null;
    if (owner === null) {
      // letting go with no receiver (things.md, Transfers): the title ended; whoever next takes the thing by first use, seeing the let-go, is its first owner
      const takers = pool.all().filter(b => b.type === 'transform' && seen(b.hash) && b.refs.derives_from === undefined && b.refs.subject === thing.hash && counts(b, pool) && pool.sees(b.hash, t.hash));
      // whoever lets go may name a clock (state.keepers on the hand-over): the first taker that clock received is the first owner, and two it received at
      // one moment are a conflict; with none named, or none received, the takers are read in causal order
      const ks = t.state.keepers === undefined ? null : keepersOf(t.state.keepers);
      let firsts = null;
      if (ks) {
        const got = takers.map(b => ({ b, at: receivedAt(b.hash, ks, pool) })).filter(x => isStr(x.at)).sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0));
        if (got.length) firsts = got.filter(x => x.at === got[0].at).map(x => x.b).sort(byHash);
      }
      if (firsts === null) firsts = earliest(takers, pool);
      if (firsts.length === 0) break;
      if (firsts.length > 1) { conflict = firsts.map(b => b.hash); break; }
      owner = speaker(firsts[0]);
      prev = firsts[0];
      if (owner == null) { owner = null; break; }
    }
  }
  return { owner, transfers: list.map(t => t.hash), conflict };
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
  return pool.all().some(a => a.type === 'transfer' && (a.state.status === 'stopped' || a.state.status === 'declined') && seen(a.hash) && a.refs.answers === t.hash && counts(a, pool) &&
    asList(t.refs.to_owner).includes(speakerOf(a, pool)) && !heldAt(a));
}
// whether a transfer the person signed in her own name (no grant, no as) yields to a crossing transfer her successor made under her successor grant: her
// transfer's causal past holds a trigger under that grant (decision E7)
function yieldsToSuccessor(t, crossing, pool) {
  if (t.refs.under !== undefined || t.refs.as !== undefined || !isStr(t.refs.author)) return false;
  const person = t.refs.author, past = pool.past(t.hash);
  return crossing.some(x => {
    const g = x !== t && x.refs.under !== undefined ? pool.get(x.refs.under) : null;
    return !!g && g.type === 'grant' && g.state.kind === 'successor' && g.refs.author === person && g.refs.to === x.refs.author &&
      pool.all().some(o => o.type === 'observe' && o.state.kind === 'trigger' && o.refs.under === g.hash && past.has(o.hash));
  });
}
function whereNow(thingIn, blocks, seen) {
  const pool = withThing(thingIn, blocks);
  const thing = typeof thingIn === 'string' ? pool.get(thingIn) : pool.get(thingIn.hash) || thingIn;
  seen = seen || new Set();
  if (seen.has(thing.hash) || seen.size >= P.limits.depth_read) return [];
  seen = new Set([...seen, thing.hash]);
  // a move counts when its signer owned the thing where that move stands (the ownership fold of its causal past, as promises.md, Bearer), or
  // holds it for one who did (folds.md, Where a thing is now; decision F7)
  const ownedBySigner = t => { const sp = speakerOf(t, pool); return sp != null && sp === ownershipFold(thing, pool, pool.past(t.hash)).owner; };
  const holders = new Set();
  const moves = pool.all().filter(t => t.type === 'transfer' && t.refs.answers === undefined && asList(t.refs.what).includes(thing.hash) && counts(t, pool));
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

// ================================================================ shares and uses (things.md, Shares; Uses of a place)
// the shares that stand on an instance or a place: things of kind share naming it in refs.subject, made by whoever owned it where the share stands;
// nothing when the subject is no thing, is a kind (some thing names it in refs.of), or was not its maker's
function sharesOn(thingIn, blocks) {
  const pool = withThing(thingIn, blocks);
  const thing = pool.get(typeof thingIn === 'string' ? thingIn : thingIn.hash);
  const isKind = pool.all().some(b => b.refs.of === thing.hash);
  const standing = [], nothing = [];
  const shares = pool.all().filter(b => b.type === 'thing' && b.state.kind === 'share' && b.refs.subject === thing.hash && counts(b, pool)).sort((a, b) => (a.hash < b.hash ? -1 : 1));
  for (const s of shares) {
    let reason = null;
    if (thing.type !== 'thing') reason = 'not_a_thing';
    else if (isKind) reason = 'kind';
    else { const maker = speakerOf(s, pool); if (maker === null || maker !== ownershipFold(thing, pool, pool.past(s.hash)).owner) reason = 'not_owner'; }
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
// what use of a place the record shows: counted transforms that make nothing from anything, naming the place in refs.subject, with state.use an act;
// dated by the named clock's receipts when keepers are given (a use not received is not dated), else by the author's own at
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
function useShown(placeIn, blocks, keepers) {
  const pool = withThing(placeIn, blocks);
  const place = pool.get(typeof placeIn === 'string' ? placeIn : placeIn.hash);
  const ks = keepers === undefined || keepers === null ? null : keepersOf(keepers);
  const by = new Map();
  const records = [];
  for (const b of pool.all()) {
    if (b.type !== 'transform' || b.refs.derives_from !== undefined || b.refs.subject !== place.hash || !isStr(b.state.use) || !counts(b, pool)) continue;
    const user = speakerOf(b, pool); if (user === null) continue;
    const date = ks ? receivedAt(b.hash, ks, pool) : (isStr(b.state.at) ? b.state.at : null);
    records.push({ hash: b.hash, user, date });
    if (!by.has(user)) by.set(user, { acts: new Set(), dates: [], bounds: new Map(), resting: null, unreceived: 0, layers: new Set() });
    const u = by.get(user);
    u.acts.add(b.state.use);
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
    return { user: name, acts: [...u.acts].sort(), count: dates.length, unreceived: u.unreceived, first: dates.length ? dates[0] : null, last: dates.length ? dates[dates.length - 1] : null,
      seasons: new Set(dates.map(d => d.slice(0, 4))).size, bounds: keys.map(k => JSON.parse('{"type":"Polygon","coordinates":' + k + '}')), resting: u.resting,
      overlaps: names.filter(o => o !== name && [...by.get(o).bounds.values()].some(rb => [...u.bounds.values()].some(ra => boundsOverlap(ra, rb)))),
      layers: [...u.layers].sort(),
      overlap_acts: names.filter(o => o !== name && [...by.get(o).bounds.values()].some(rb => [...u.bounds.values()].some(ra => boundsOverlap(ra, rb)))).map(o => ({ with: o, act: [...by.get(o).acts].some(a => u.acts.has(a)) ? 'same' : 'different' })),
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
  return { clock: ks ? 'keepers' : 'author', users, disputes };
}


// ================================================================ the signer's word and the claim of invasion (promises.md, Disputes)
// the words beside a block: an observe of kind not_free naming it in refs.subject, counting as hers only when written by the block's author
function notFreeShown(blockIn, blocks) {
  const pool = withThing(blockIn, blocks);
  const block = pool.get(typeof blockIn === 'string' ? blockIn : blockIn.hash) || blockIn;
  const words = pool.all().filter(b => b.type === 'observe' && b.state.kind === 'not_free' && b.state.status === undefined && b.refs.subject === block.hash && counts(b, pool)).sort(byHash);
  const shown = [], nothing = [];
  for (const n of words) {
    if (isStr(n.refs.author) && n.refs.author === block.refs.author) shown.push({ block: n.hash, by: n.refs.author, reason: isStr(n.state.reason) ? n.state.reason : null, threat: isStr(n.state.threat) ? n.state.threat : null, at: isStr(n.state.at) ? n.state.at : null });
    else nothing.push({ block: n.hash, why: 'not_signer' });
  }
  return { shown, nothing };
}
// who holds a claim now: the claimant, then each hand-over (a transfer naming the claim in refs.what, signed by the holder where it stands, accepted by the new holder); two by one holder that do not see each other are a fork
function claimHolder(claim, claimant, pool) {
  const accepted = t => pool.all().some(a => a.type === 'transfer' && a.state.status === 'accepted' && asList(a.refs.answers).includes(t.hash) && counts(a, pool) && asList(t.refs.to_owner).includes(speakerOf(a, pool)) && answerStands(t, a, pool));
  const cands = pool.all().filter(t => t.type === 'transfer' && t.state.status === undefined && t.state.money === undefined && asList(t.refs.what).includes(claim.hash) && t.refs.to_owner !== undefined && counts(t, pool) && pool.sees(t.hash, claim.hash) && accepted(t));
  let cur = claimant; const used = new Set();
  for (;;) {
    const mine = cands.filter(t => !used.has(t.hash) && speakerOf(t, pool) === cur);
    if (!mine.length) return cur;
    if (mine.some(t => mine.some(u => u.hash !== t.hash && !pool.sees(t.hash, u.hash) && !pool.sees(u.hash, t.hash)))) return cur;
    const first = [...mine].sort((a, b) => pool.past(a.hash).size - pool.past(b.hash).size || cmp(a.hash, b.hash))[0];
    const next = asList(first.refs.to_owner)[0];
    if (next === undefined) return cur;
    used.add(first.hash); cur = next;
  }
}
function invasionShown(claimIn, blocks) {
  const pool = withThing(claimIn, blocks);
  const claim = pool.get(typeof claimIn === 'string' ? claimIn : claimIn.hash) || claimIn;
  if (claim.type !== 'observe' || claim.state.kind !== 'invasion') return null;
  const ch = claim.hash;
  const claimant = speakerOf(claim, pool);
  const accused = [...new Set(asList(claim.refs.to))].sort();
  const crossed = isStr(claim.refs.subject) ? claim.refs.subject : null;
  const evidence = [...new Set(asList(claim.refs.derives_from))].sort();
  const holder = claimant === null ? null : claimHolder(claim, claimant, pool);
  let harmed = false;
  if (crossed !== null && claimant !== null) {
    const t = pool.get(crossed);
    if (t && t.type === 'thing') harmed = ownershipFold(t, pool, pool.past(ch)).owner === claimant || sharesOn(t, pool).standing.some(s => s.owner === claimant);
    else if (t && t.type === 'actor') harmed = crossed === claimant;
  }
  const standing = !harmed ? 'none' : holder === claimant ? 'harmed' : 'holds';
  const sideOfClaim = w => claimant === w || holder === w;
  const isAccused = w => accused.includes(w);
  const nothing = [], named = [];
  for (const g of pool.all().filter(g => g.type === 'grant' && g.state.kind === 'referee' && g.state.status === undefined && g.refs.subject === ch && counts(g, pool))) {
    const judge = g.refs.to, signer = speakerOf(g, pool);
    if (!isStr(judge) || signer === null) continue;
    if (!(sideOfClaim(signer) || isAccused(signer))) continue;
    if (sideOfClaim(judge) || isAccused(judge)) { nothing.push({ block: g.hash, reason: 'side' }); continue; }
    named.push({ judge, signer, grant: g.hash });
  }
  const judgeKeys = [...new Set(named.map(n => n.judge + '\u0000' + n.signer))].sort();
  const judges = judgeKeys.map(k => { const [judge, signer] = k.split('\u0000'); return { judge, signer }; });
  const acceptedBy = (who, grant) => pool.all().some(a => a.type === 'grant' && a.state.status === 'accepted' && a.refs.answers === grant && counts(a, pool) && speakerOf(a, pool) === who);
  const accusedOut = accused.map(who => ({ who,
    named: [...new Set(named.filter(n => n.signer === who).map(n => n.judge))].sort(),
    accepted: [...new Set(named.filter(n => sideOfClaim(n.signer) && acceptedBy(who, n.grant)).map(n => n.judge))].sort(),
    notified: (() => { const ks = { names: [who], needed: 1 }; const ats = pool.all().filter(m => m.type === 'observe' && m.state.kind === 'message' && asList(m.refs.for).includes(ch) && asList(m.refs.to).includes(who) && counts(m, pool)).map(m => receivedAt(m.hash, ks, pool)).filter(x => x !== null).sort(); return ats.length ? ats[0] : null; })() }));
  const rulings = [];
  for (const r of pool.all().filter(r => counts(r, pool))) {
    for (const word of ['confirms', 'defeats']) {
      if (!asList(r.refs[word]).includes(ch)) continue;
      const signer = r.refs.author; if (!isStr(signer)) continue;
      // the judge is whom the ruling speaks for: a circle named as judge rules by its holders of sign, signing as it (circles.md)
      const sp = speakerOf(r, pool);
      const author = sp !== null ? sp : signer;
      if (sideOfClaim(signer) || isAccused(signer) || sideOfClaim(author) || isAccused(author)) { nothing.push({ block: r.hash, reason: 'side' }); continue; }
      const by = [...new Set(judges.filter(j => j.judge === author).map(j => j.signer))].sort();
      if (!by.length) { nothing.push({ block: r.hash, reason: 'not_named' }); continue; }
      rulings.push({ block: r.hash, judge: author, named_by: by, word, up_to: word === 'confirms' && r.state.up_to !== undefined ? r.state.up_to : null, evidence: [...new Set(asList(r.refs.derives_from))].sort() });
    }
  }
  rulings.sort((a, b) => cmp(a.block, b.block) || cmp(a.word, b.word));
  nothing.sort((a, b) => cmp(a.block, b.block) || cmp(a.reason, b.reason));
  const nothingOut = nothing.filter((x, i) => i === 0 || x.block !== nothing[i - 1].block || x.reason !== nothing[i - 1].reason);
  const order = evidence.some(h => { const o = pool.get(h); if (!o || !counts(o, pool)) return false; const w = speakerOf(o, pool); return w !== null && isAccused(w) && asList(o.refs.to).some(t => t !== w && isAccused(t)); });
  return { commanded: order ? 'shown' : 'none', claimant, holder, standing, crossed, evidence, accused: accusedOut, judges: judges.map(j => ({ judge: j.judge, named_by: j.signer })), rulings, nothing: nothingOut };
}


// ================================================================ a pot (folds.md, A pot)
function signalBy(c) {
  if (!isObj(c)) return null;
  if (c.signal !== undefined && Array.isArray(c.by)) return c.by.filter(isStr);
  const inner = c.within !== undefined ? c.within : c.without;
  return inner === undefined ? null : signalBy(inner);
}
// the lot and everything made from it, read along the makes (things.md, A make): a counted transform that names a thing in derives_from makes the things that name that transform in theirs, when its maker owned that thing where the make stands
function madeFrom(lot, pool) {
  const found = [lot];
  for (;;) {
    const before = found.length;
    const makes = pool.all().filter(t => t.type === 'transform' && counts(t, pool) && asList(t.refs.derives_from).some(d => found.includes(d) && ownershipFold(d, pool, pool.past(t.hash)).owner === speakerOf(t, pool))).map(t => t.hash);
    for (const o of pool.all()) if (o.type === 'thing' && asList(o.refs.derives_from).some(d => makes.includes(d)) && !found.includes(o.hash)) found.push(o.hash);
    if (found.length === before) return found;
  }
}
function potFold(headIn, blocks, now) {
  const pool = withThing(headIn, blocks);
  const head = pool.get(typeof headIn === 'string' ? headIn : headIn.hash) || headIn;
  if (head.type !== 'promise' || head.refs.answers !== undefined) return null;
  const holder = speakerOf(head, pool); if (holder === null) return null;
  const terms = isObj(head.state.terms) ? head.state.terms : {};
  // the pot counts money in one currency, or a count of one named kind (an amount in one unit); nothing is converted
  const measureOf = v => (isObj(v) && isStr(v.currency) ? { kind: 'money', key: v.currency } : isObj(v) && isStr(v.unit) && isStr(v.value) && RX.decimal.test(v.value) ? { kind: 'count', key: v.unit } : null);
  const backing = measureOf(terms.backing) ? terms.backing : null;
  const big = m => { try { return BigInt(String(m)); } catch (e) { return 0n; } };
  const moneyOf = t => (isObj(t.state.money) && isStr(t.state.money.currency) ? t.state.money : isObj(t.state.amount) && isStr(t.state.amount.unit) && isStr(t.state.amount.value) && RX.decimal.test(t.state.amount.value) ? t.state.amount : null);
  const accepted = (t, seen) => pool.all().some(a => a.type === 'transfer' && a.state.status === 'accepted' && seen(a.hash) && asList(a.refs.answers).includes(t.hash) && counts(a, pool) && asList(t.refs.to_owner).includes(speakerOf(a, pool)) && answerStands(t, a, pool));
  const base = t => t.type === 'transfer' && t.state.status === undefined && asList(t.refs.for).length === 1 && asList(t.refs.for)[0] === head.hash && counts(t, pool) && pool.sees(t.hash, head.hash);
  const insAll = pool.all().filter(t => base(t) && moneyOf(t) && asList(t.refs.to_owner).length === 1 && t.refs.to_owner === holder && accepted(t, () => true)).sort(byHash);
  // a cap written out as `all` (the schema's term `cap`): all the holder owns on the day a claim is read, the referee fixing the sum; it reaches property only. The fold shows
  // "no limit" (cap "all", backing and left null) and a payout is never past the pot (profiles/vouches.md)
  const noLimit = backing === null && terms.cap === 'all';
  const measure = backing ? measureOf(backing) : insAll.length ? measureOf(moneyOf(insAll[0])) : noLimit ? (() => { const outs = pool.all().filter(t => base(t) && moneyOf(t) && !(asList(t.refs.to_owner).length === 1 && t.refs.to_owner === holder)).sort(byHash); return outs.length ? measureOf(moneyOf(outs[0])) : null; })() : null;
  if (measure === null) return { holder, currency: null, unit: null, backing: 0, paid_in: 0, paid_out: 0, left: 0, pay_in: terms.pay_in === 'kept' || terms.pay_in === 'held' ? terms.pay_in : null, held_back: 0, cap: noLimit ? 'all' : null, payouts: [] };
  const same = v => { const m = measureOf(v); return m !== null && m.kind === measure.kind && m.key === measure.key; };
  // a count is held as whole numbers of the finest decimal place any amount in the pot uses, so sums are exact
  const places = x => (x.value.split('.')[1] || '').length;
  const K = measure.kind === 'count' ? Math.max(0, ...[backing, ...pool.all().filter(base).map(moneyOf)].filter(v => v && same(v)).map(places)) : 0;
  const scaled = v => { if (measure.kind === 'money') return big(v.minor); const [w, f = ''] = v.value.replace(/^-/, '').split('.'); const n = BigInt(w + f.padEnd(K, '0')); return v.value.startsWith('-') ? -n : n; };
  const out = n => {
    if (measure.kind === 'money') return n <= 9007199254740991n ? Number(n) : String(n);
    const abs = n < 0n ? -n : n, D = 10n ** BigInt(K), frac = (abs % D).toString().padStart(K, '0').replace(/0+$/, '');
    return (n < 0n ? '-' : '') + (abs / D).toString() + (K && frac ? '.' + frac : '');
  };
  const back = backing && same(backing) ? scaled(backing) : 0n;
  const ins = insAll.filter(t => same(moneyOf(t))).map(t => ({ t, d: scaled(moneyOf(t)) }));
  const paidIn = ins.reduce((s, x) => s + x.d, 0n);
  // each pay-in is kept (a premium: leaving takes nothing back) or held (it comes back in full and is never paid out while held); the head's
  // `pay_in` says which, and only `kept` is spent: with neither said a pay-in counts toward no payout, and the card shows it as not said (profiles/pools.md)
  const payIn = terms.pay_in === 'kept' || terms.pay_in === 'held' ? terms.pay_in : null;
  const heldAt = past => { const seen = h => past.has(h); return payIn !== 'kept' ? back : ins.filter(x => seen(x.t.hash) && accepted(x.t, seen)).reduce((s, x) => s + x.d, back); };
  const schema = isStr(head.refs.schema) ? pool.get(head.refs.schema) : null;
  const confirmers = schema && isObj(schema.state.grounds) ? asList(schema.state.grounds.confirmers) : [];
  const payouts = [], notConfirmed = new Set(), notHolder = new Set();
  // a vouch to whoever holds a lot (promises.md, Bearer): when the head's receiver is a thing, a payout counts as the claim of its owner where the payout stands
  const lot = isStr(head.refs.to) && pool.get(head.refs.to) && pool.get(head.refs.to).type === 'thing' ? head.refs.to : null;
  for (const t of pool.all().filter(base)) {
    const m = moneyOf(t); if (!m || !same(m)) continue;
    const amount = scaled(m), to = asList(t.refs.to_owner);
    if (amount <= 0n || to.length !== 1 || to[0] === holder || speakerOf(t, pool) !== holder) continue;
    if (!accepted(t, () => true)) continue;
    if (t.state.condition !== undefined) {
      if (reading.has(t.hash)) continue;
      reading.add(t.hash);
      let held; try { held = conditionHolds(t.state.condition, pool.all(), now) === true; } finally { reading.delete(t.hash); }
      if (!held || letGo(t, pool, () => true)) continue;
    }
    const by = t.state.condition === undefined ? null : signalBy(t.state.condition);
    if (confirmers.length && !(by && by.length && by.every(b => confirmers.includes(b)))) notConfirmed.add(t.hash);
    if (lot !== null && !madeFrom(lot, pool).some(x => (x === lot || pool.past(t.hash).has(x)) && ownershipFold(x, pool, pool.past(t.hash)).owner === to[0])) notHolder.add(t.hash);
    payouts.push({ t, hash: t.hash, to: to[0], amount, past: pool.past(t.hash) });
  }
  payouts.sort((a, b) => a.past.size - b.past.size || cmp(a.hash, b.hash));
  const fits = payouts.map(p => p.amount <= heldAt(p.past));
  const counted = payouts.map(() => false), why = payouts.map(() => null);
  payouts.forEach((p, i) => {
    if (notConfirmed.has(p.hash)) { why[i] = 'not_confirmed'; return; }
    if (notHolder.has(p.hash)) { why[i] = 'not_holder'; return; }
    if (noLimit) { counted[i] = true; return; }
    let used = 0n;
    payouts.forEach((q, j) => { if (j !== i && counted[j] && p.past.has(q.hash)) used += q.amount; });
    const room = heldAt(p.past) - used;
    if (p.amount > room) { why[i] = 'past_the_pot'; return; }
    let unseen = 0n;
    payouts.forEach((q, j) => { if (j !== i && fits[j] && !notConfirmed.has(q.hash) && !notHolder.has(q.hash) && !p.past.has(q.hash) && !q.past.has(p.hash)) unseen += q.amount; });
    if (p.amount + unseen > room) { why[i] = 'unseen_together'; return; }
    counted[i] = true;
  });
  const paidOut = payouts.reduce((s, p, i) => (counted[i] ? s + p.amount : s), 0n);
  let left = back + (payIn === 'kept' ? paidIn : 0n) - paidOut; if (left < 0n) left = 0n;
  const rows = payouts.map((p, i) => ({ block: p.hash, to: p.to, ...(measure.kind === 'money' ? { money: { minor: out(p.amount), currency: measure.key } } : { amount: { value: out(p.amount), unit: measure.key } }), counts: counted[i], why: why[i] })).sort((a, b) => cmp(a.block, b.block));
  const currency = measure.kind === 'money' ? measure.key : null, unit = measure.kind === 'count' ? measure.key : null;
  return { holder, currency, unit, backing: noLimit ? null : out(back), paid_in: out(paidIn), paid_out: out(paidOut), left: noLimit ? null : out(left), cap: noLimit ? 'all' : null, pay_in: payIn, held_back: out(payIn === 'held' ? paidIn : 0n), payouts: rows };
}

// ================================================================ the successor view (profiles/successor.md)
function successorView(grant, blocks, o) {
  const pool = poolOf(blocks);
  const arrivals = (o && o.arrivals) || {}, now = o && o.now;
  // needed (a whole number of at least 1) and wait are the person's own words: with either absent or malformed nothing is filled in, and it never fires
  const witnesses = asList(grant.state.witnesses), needed = Number.isInteger(grant.state.needed) && grant.state.needed >= 1 ? grant.state.needed : null, wait = grant.state.wait;
  const at = b => (isStr(arrivals[b.hash]) && arrivals[b.hash] !== '' ? arrivals[b.hash] : null);
  // events: the counted trigger observes of listed witnesses under the grant, about the person; defeats: the person's counted defeats (profiles/successor.md)
  const events = pool.all().filter(b => b.type === 'observe' && b.state.kind === 'trigger' && b.refs.under === grant.hash && witnesses.includes(b.refs.author) && asList(b.refs.subject).includes(grant.refs.author) && counts(b, pool));
  const defeats = pool.all().filter(b => b.refs.author === grant.refs.author && b.refs.defeats !== undefined && counts(b, pool));
  // arrival order: known arrivals by time, then unknown ones; equal ones by hash, only to name one
  const order = (x, y) => { const a = at(x), b = at(y); if (a !== b) { if (a === null) return 1; if (b === null) return -1; return a < b ? -1 : 1; } return byHash(x, y); };
  // the least reading: start with nothing cancelled; one event per witness (their earliest standing one) gives fires; cancel every event a defeats
  // names that arrived strictly before fires, at an unknown time, or while nothing fires; repeat until nothing more is cancelled
  const cancelled = new Set();
  let standing, since, fires;
  for (;;) {
    const seenW = new Set();
    standing = events.filter(e => !cancelled.has(e.hash)).sort(order).filter(e => (seenW.has(e.refs.author) ? false : (seenW.add(e.refs.author), true)));
    since = quorum(standing.map(e => e.refs.author), needed) ? at(standing[needed - 1]) : null;
    fires = since === null || !isStr(wait) ? null : addDur(since, wait);
    const before = cancelled.size;
    for (const e of events) {
      if (cancelled.has(e.hash)) continue;
      if (defeats.some(d => asList(d.refs.defeats).includes(e.hash) && (at(d) === null || fires === null || at(d) < fires))) cancelled.add(e.hash);
    }
    if (cancelled.size === before) break;
  }
  return { events: standing.map(e => e.hash).sort(), cancelled: [...cancelled].sort(), since, fires, fired: fires !== null && now !== undefined && now !== null && now >= fires };
}

// ================================================================ consent and admission (consent.md)
// namesOf(sender, block, pool): who a sender is named by (consent follows the principal): itself, its operators, and whom its block speaks for
// (folds.md, Who a block speaks for: the one speaker rule, scope included). Without the sender's block, only the first two.
function namesOf(sender, block, pool) {
  const out = [sender, ...operatorsOf(sender, pool)];
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
  // A recorder binds only its own side: it is named, or one of its operators is.
  const sideOf = (recorder) => has && (names.includes(recorder) || operatorsOf(recorder, pool).some(o => names.includes(o)));
  const personOf = b => b.refs.from !== undefined ? b.refs.from : b.refs.author;
  const all = pool.all().filter(b => b.type === 'observe' && b.state.kind === 'consent' && personOf(b) === person && counts(b, pool) &&
    !(b.state.word === 'yes' && asList(b.refs.subject).length === 0)); // a yes widens, so it names whom it is about; one that names no one counts for nothing
  const stops = all.filter(b => b.state.word === 'stop');
  const cons = all.filter(b => {
    if (b.refs.author === person) return true;
    if (b.state.word === 'stop') return sideOf(b.refs.author);
    // A recorder's yes counts only for its own side, as the lift of a stop the same recorder recorded, in its causal past: her own stop
    // is lifted by her own block alone (consent.md, Only the person lifts a STOP)
    if (b.state.word === 'yes') return sideOf(b.refs.author) && !stops.some(st => st.refs.author === person && pool.sees(b.hash, st.hash)) && stops.some(st => st.refs.author === b.refs.author && st.refs.from === person && pool.sees(b.hash, st.hash));
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
// admission_refusals(block, recipient, held, rule, arrivedToday): the message refusals of nodes.md and consent.md
function admissionRefusals(block, recipient, held, rule, today) {
  const pool = poolOf(held);
  rule = rule || {};
  const out = [];
  const author = block.refs.author;
  const consent = consentFold(recipient, author, pool, block);
  // an autonomous system: one an operator answers for too, or a block under a grant
  const isAgent = autonomous(author, pool, true) || block.refs.under !== undefined;
  // consent follows the principal (consent.md): one who answered the sender, its operators, or the grantor of the live grant it acts under is no stranger
  const names = namesOf(author, block, pool);
  // only her accept, her counter-offer or a deal she opened with him makes a sender no stranger (decision H13): a counted block of hers that answers
  // one of his accepted, or as a counter (a promise with no status), or a promise of hers, no answer and no stop, naming him as a side. A declined or
  // stopped answer, or any other, keeps him a stranger. Only a block that counts: a forked one binds no one (core.md, invariant 3)
  const answersHis = b => asList(b.refs.answers).some(h => { const t = pool.get(h); return t && names.includes(t.refs.author); });
  const dealt = pool.all().some(b => b.refs.author === recipient && binds(b, pool) &&
    ((answersHis(b) && (b.state.status === 'accepted' || (b.type === 'promise' && b.state.status === undefined))) ||
     (b.type === 'promise' && b.refs.answers === undefined && b.refs.updates === undefined && b.state.status === undefined && ['from', 'to'].some(k => isStr(b.refs[k]) && names.includes(b.refs[k])))));
  // a recorder's yes lifts only a stop it recorded: only the receiver's own yes ends strangerhood (consent.md)
  const yes = consent.word === 'yes' && (pool.get(consent.block) || { refs: {} }).refs.author === recipient;
  const stranger = !dealt && !yes;
  // a listed party is exempt from the count only for a block whose key still speaks for that party (nodes.md, Admission): a block of a key rotated
  // out past its counted line, frozen or void is counted as anyone else's
  const speaksForAuthor = () => { const p = pool.get(block.hash) ? pool : new Pool([...pool.all(), block]); return identityFold(author, p).signed_by_author[block.hash] === true; };
  const listed = asList(rule.parties).includes(author) && speaksForAuthor();
  // only a rule that states an order channel refuses: with none, what the node does is its own software's choice (consent.md, decision F1)
  if (stranger && isAgent && rule.order_channel !== undefined) {
    // the order channel is a list of acts; anything else names none
    const channel = Array.isArray(rule.order_channel) && rule.order_channel.some(n => actNames(block).includes(n));
    if (!channel) out.push({ code: 'not_human', detail: 'a first block to a stranger that an autonomous system signed, outside the receiver\'s order channel' });
  }
  // per_stranger counts each sender outside parties alone (nodes.md, Admission; decision D17), answered or not: today is this sender's count
  if (!listed && Number.isInteger(rule.per_stranger) && rule.per_stranger >= 0 && today >= rule.per_stranger) out.push({ code: 'not_admitted', detail: 'the node took its per_stranger blocks for the day' });
  const order = Object.keys(P.refusals.codes.message);
  return out.sort((x, y) => order.indexOf(x.code) - order.indexOf(y.code));
}
// residency (profiles/residency.md): a receiver that states a non-empty holds_in refuses a block whose stays_in does not list every entry of it;
// one that states none refuses nothing, and a block with no stays_in asks nothing. Labels are compared exactly; none is expanded.
const residencyRefusals = (block, holdsIn) => {
  const labels = v => (Array.isArray(v) ? v : isStr(v) && v !== '' ? [v] : []).filter(isStr);
  const holds = Array.isArray(holdsIn) ? holdsIn.filter(isStr) : [], stays = labels(block.state.stays_in);
  if (!holds.length || !stays.length) return [];
  return holds.every(r => stays.includes(r)) ? [] : [{ code: 'residency', detail: 'the node holds outside stays_in' }];
};
const earnestShapeOk = d => isObj(d) && !moneyProblem(d.money) && isStr(d.holder) && !idProblem(d.holder) && Object.keys(d).every(k => ['money', 'holder'].includes(k));
function earnestPaid(ask, earnest, blocks) {
  const pool = poolOf(blocks);
  return pool.all().some(t => t.type === 'transfer' && asList(t.refs.for).includes(ask.hash) && t.refs.to_owner === earnest.holder && isObj(t.state.money) &&
    jcs(t.state.money.currency) === jcs(earnest.money.currency) && t.state.money.minor >= earnest.money.minor && counts(t, pool));
}
// A model's reading is the autonomous system's claim; it becomes the person's only when she puts that fact to someone else in her own step (things.md, Truth)
const readingIsPersonsClaim = (reading, person, blocks) => reading.state.kind === 'reading' && poolOf(blocks).all().some(b => b.refs.author === person && asList(b.refs.derives_from).includes(reading.hash) && [...asList(b.refs.to), ...asList(b.refs.to_owner)].some(x => x !== person));

// ================================================================ messages (privacy.md, nodes.md)
const withoutSignature = m => { const o = { ...m }; delete o.signature; return o; };
const signMessage = (m, privHex, suite) => ({ ...withoutSignature(m), signature: signBytes(Buffer.from(jcs(withoutSignature(m)), 'utf8'), privHex, suite) });
const verifyMessage = (m, pubHex) => verifyBytes(Buffer.from(jcs(withoutSignature(m)), 'utf8'), m.signature, pubHex);
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
const pullRefusals = (m, o) => requestRefusals(m, o, P.messages.signed_pull), pushRefusals = (m, o) => requestRefusals(m, o, P.messages.signed_push);
const answerSignedBy = (a, pubHex) => verifyMessage(a, pubHex);
const pushAnswer = (fields, o) => signMessage({ ...withoutSignature(fields), node: o.node }, o.privateKey, o.suite || 'std');
const pushRequest = (messages, forWhom) => ({ messages, for: forWhom });
function wellKnownErrors(d) {
  const out = [];
  for (const k of P.messages.discovery) if (!(k in d)) out.push('missing ' + k);
  if (d.protocol !== 'foodblock') out.push('protocol');
  if (!isObj(d.endpoints)) out.push('endpoints'); else for (const k of P.messages.endpoints) if (!isStr(d.endpoints[k])) out.push('endpoint ' + k);
  return out;
}
const announcement = d => ({ protocol: d.protocol, version: d.version, node: d.node, endpoints: d.endpoints });
// A sealed copy: open it, check the block inside (size limit), return what the recipient learns.
function openCopy(msg, privHex) {
  if (msg.version !== undefined) throw cryptoError('a sealed copy carries no version', 'shape');
  const plain = open(msg.envelope, privHex);
  if (plain.version !== undefined) throw cryptoError('a plaintext carries no version', 'shape');
  const b = blockOnly(plain.block);
  if (Buffer.byteLength(canonical(b.type, b.state, b.refs), 'utf8') > P.limits.block_bytes) { const e = new Error('size_limit'); e.code = 'size_limit'; e.kind = 'refusal'; throw e; }
  const hash = hashOfBlock(b, suiteFromBlock(b));
  // the public header describes the body exactly (privacy.md): its hash, author, seq, prev and flags
  const h = msg.header;
  if (isObj(h) && (h.hash !== hash || h.author !== b.refs.author || h.seq !== b.state.seq || h.prev !== b.refs.prev || ['skip', 'withheld'].some(f => (h[f] === true) !== (b.state[f] === true)))) throw new Error('the header does not describe the block inside it');
  return { block: plain.block, signature: plain.signature, reveals: plain.reveals, hash };
}
const headerSignedBy = (msg, pubHex) => verifyBytes(Buffer.from(jcs(msg.header), 'utf8'), msg.header_signature, pubHex);
// wrap / unwrap (core.md section 6): a public block as a message
// ---- answering a pull (nodes.md, Pull): the matches in arrival order, each with its arrival number; a lie travels with its proof
function answerPull(log, request, node, privateKey, choices, asker, heldIn, suite, through) {
  const { cap, serves_pairs: servesPairs } = choices;
  const since = Number(request.since) || 0;
  const limit = request.limit > 0 ? Math.min(request.limit, cap) : cap;
  asker = asker || request.signer;
  const held = Array.isArray(heldIn) ? poolOf(heldIn) : poolOf(log.map(e => e.block));
  // a filter reads only what the asker may see: a public block whole, a non-public one whole only by an asker it has a copy for,
  // else its public header (author, prev, seq, hash) alone, so a private block held in the clear answers no filter on its content
  const seenBy = e => !Array.isArray(e.block.state.audience) || Boolean(asker && e.copies && e.copies[asker]);
  const headerView = b => ({ hash: b.hash, state: { seq: b.state.seq === undefined ? null : b.state.seq, audience: ['sealed'] }, refs: { author: b.refs.author === undefined ? null : b.refs.author, prev: b.refs.prev === undefined ? null : b.refs.prev } });
  // a genesis has no public header (decision H10): to an asker outside its audience nothing of a sealed genesis is sent
  const isGen = b => b.type === 'actor' && b.refs.author === undefined && b.state.seq === undefined && isStr(b.state.public_key_sign);
  let found = log.filter(e => e.n > since && (seenBy(e) ? matches(e.block, request.filter, held) : !isGen(e.block) && matches(headerView(e.block), request.filter, held))).sort((a, b) => a.n - b.n);
  if (request.heads === true) {
    const named = new Set(found.flatMap(e => [...asList(e.block.refs.prev), ...asList(e.block.refs.updates)]));
    found = found.filter(e => !named.has(e.block.hash));
  }
  const full = found.length >= limit;
  found = found.slice(0, limit);
  // an answer that is not full goes on from the last arrival the node read (`through`), so a window that matched nothing still moves on
  const last = found.length ? found[found.length - 1].n : since;
  const next = Number.isInteger(through) && !full ? Math.max(last, through) : last;
  // a node that serves a pair's proof (its own choice) sends the other half of a pair (one key, one prev) with a block of it, matched or not, before since or after
  const have = new Set(found.map(e => e.block.hash)), proofs = [];
  for (const e of servesPairs ? found : []) {
    const at = placeOf(e.block, held);
    if (!at) continue;
    for (const o of log) if (!have.has(o.block.hash) && inPlace(o.block, at, held)) { have.add(o.block.hash); proofs.push(o); }
  }
  found = found.concat(proofs).sort((a, b) => a.n - b.n);
  const messageOf = e => {
    const a = e.block.state.audience;
    if (a === 'public' || !Array.isArray(a)) return wrap(e.block);
    const copy = asker && e.copies && e.copies[asker];
    if (copy) return copy;
    return { header: e.header || header(e.block), header_signature: e.header_signature === undefined ? null : e.header_signature };
  };
  const answer = { node, request: hashStr('std', jcs(request)), blocks: found.map(e => ({ n: e.n, message: messageOf(e) })), next };
  // signed by the node when a private key is given (protocol.json door.answer_pull: `signature` only then)
  return isStr(privateKey) ? signMessage(answer, privateKey, suite || 'std') : answer;
}
// a message names no suite (core.md, sections 2 and 6): one that does is refused, so no label gives one signed block a second id
const wrap = b => ({ block: blockOnly(b), signature: b.signature });
function unwrap(m, held) {
  if (m.suite !== undefined) throw cryptoError('a message names no suite', 'bad_hash');
  if (m.version !== undefined) throw cryptoError('a message carries no version', 'shape');
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
  // a reading counts only if its signer is the sensor itself, the sensor's owner (the ownership fold of the sensor thing), or an autonomous system the owner named:
  // the receiver of a live operator grant the owner signed whose refs.subject names the sensor (tasks.md)
  const pool = poolOf(blocks || []);
  const sensorBlock = pool.get(c.reading);
  const owner = sensorBlock && sensorBlock.type === 'thing' ? ownershipFold(sensorBlock, blocks || []).owner : null;
  const operatedBy = (who, r) => isStr(who) && isStr(owner) && (who === owner || pool.all().some(g => g.type === 'grant' && g.state.kind === 'operator' && g.state.status === undefined && asList(g.refs.subject).includes(c.reading) && g.refs.to === who && g.refs.author === owner && grantLive(g, pool, new Set(), r)));
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
// a reader of the recovery reach states what a block whose arrival it does not know is read as, `inside` or `outside` the reach; no default
const reachArrivals = (v, choice) => {
  const m = arrivalsArg(v);
  if (!m) return null;
  if (choice !== 'inside' && choice !== 'outside') throw argError('unknown_arrival is `inside` or `outside` the reach when arrivals are given: the reader chooses');
  return Object.defineProperty({ ...m }, '__outside', { value: choice === 'outside' });
};
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

// ================================================================ a sealed limit (authority.md, The limit is the principal's fence)
// The commitment: the salted hash (privacy.md) of the canonical JSON of { limit, every, each }, each left out when there is none.
function limitCommitment(limit, every, salt, suite, each) { const v = {}; if (limit !== undefined && limit !== null) v.limit = limit; if (every) v.every = every; if (each !== undefined && each !== null) v.each = each; return saltedHash(salt, v, suite); }
// The principal's node (and the autonomous system) open it: the observe of kind limit, for the grant, whose limit, every, each and salt commit to scope.limit_commitment.
function limitOpens(grant, fence, suite) {
  const c = grant && isObj(grant.state) && isObj(grant.state.scope) ? grant.state.scope.limit_commitment : undefined;
  if (!isStr(c) || !fence || fence.type !== 'observe' || !isObj(fence.state) || fence.state.kind !== 'limit') return false;
  if (!asList(fence.refs && fence.refs.for).includes(grant.hash)) return false;
  // the salt is 16 random bytes as hex (grammar.salt)
  if ((fence.state.limit === undefined && fence.state.each === undefined) || !isStr(fence.state.salt) || !RX.salt.test(fence.state.salt)) return false;
  return limitCommitment(fence.state.limit, fence.state.every, fence.state.salt, suite, fence.state.each) === c;
}

// limit_within_parent (authority.md, What a reader can check about a child's sealed limit): on the principal's node, which holds both limit observes,
// whether the child's limit keeps to the parent's: each of the parent's limit and each, the child has too, in its currency or unit, no larger; where the
// parent has an every, the child's is no shorter, both added to at (the parent grant's at)
function limitWithinParent(child, parent, at) {
  const c = isObj(child) && isObj(child.state) ? child.state : child, p = isObj(parent) && isObj(parent.state) ? parent.state : parent;
  if (!isObj(c) || !isObj(p)) return false;
  // a limit with no period covers all time: a child with a period under it could spend the same limit again every period
  if (p.limit !== undefined && p.every === undefined && c.every !== undefined) return false;
  return narrowerThan(c, p, at, ['limit', 'each', 'every']);
}
// within_limit (authority.md, The limit is the principal's fence): on the principal's node, whether one act of value stays inside the fence, given what
// was spent in the period (minor units, or the amount's value: a whole number or a decimal string), all compared exactly. A cap on each act holds
// whatever was spent; another currency or unit, or a spent that is not a number, is never within.
function withinLimit(limit, value, spent) {
  const fence = isObj(limit) && isObj(limit.state) ? limit.state : limit;
  const [cap, each] = isObj(fence) && (fence.limit !== undefined || fence.each !== undefined) ? [fence.limit, fence.each] : [limit, undefined];
  const exact = x => Number.isSafeInteger(x) ? { n: BigInt(x), d: 1n } : (isStr(x) && RX.decimal.test(x) ? dec(x) : null);
  const size = m => (isObj(m) && 'unit' in m ? exact(m.value) : (isObj(m) ? exact(m.minor) : null));
  const measure = m => ('unit' in m ? m.unit : m.currency);
  const fits = c => isObj(c) && isObj(value) && ('unit' in c) === ('unit' in value) && measure(c) !== undefined && measure(value) !== undefined && jcs(measure(c)) === jcs(measure(value));
  const s0 = exact(spent), v = size(value);
  if (!s0 || !v) return false;
  if (s0.n < 0n || v.n < 0n) return false; // a value or spent below zero is never within (authority.md)
  const tn = s0.n * v.d + v.n * s0.d, td = s0.d * v.d;
  const atMost = (n, d, c) => { const z = size(c); return !!z && n * z.d <= z.n * d; };
  return (cap === undefined || (fits(cap) && atMost(tn, td, cap))) && (each === undefined || (fits(each) && atMost(v.n, v.d, each)));
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
// Sealed bids for one quarrel (profiles/bids.md). The quarrel is a deal's first promise; its `from` side is owed the price and its `to` side pays it.
// Each side signs one observe of kind `bid` with refs.subject the quarrel and state.commitment to a number (whole minor units, text), and states the
// `deadline`, the named clock `keepers` and the `currency` the form runs on; the two must state the same, else no bid counts. A side that signs two bids
// counts for none. A bid counts when `needed` keepers received it by the deadline. An opening is any counted block of the same side carrying
// state.opening that opens the commitment, received by the deadline too. When both are open, the numbers overlap when the `to` side's (the most it
// would pay) is at least the `from` side's (the least it would take), and the middle is their mean, rounded half up. With no overlap nothing more is shown.
function bidsShown(quarrel, blocksIn) {
  if (!isObj(quarrel) || quarrel.type !== 'promise' || quarrel.refs.answers !== undefined) return null;
  const pool = new Pool([quarrel, ...poolOf(blocksIn).all()]);
  const qh = quarrel.hash;
  const empty = currency => ({ quarrel: qh, currency, in: [], opened: [], overlap: null, middle: null });
  const bids = [];
  for (const side of ['from', 'to']) {
    const id = quarrel.refs[side];
    if (!isStr(id)) return empty(null);
    const mine = pool.all().filter(o => o.type === 'observe' && o.state.kind === 'bid' && o.refs.subject === qh && counts(o, pool) && speakerOf(o, pool) === id);
    if (mine.length !== 1) return empty(null);
    bids.push({ side, id, bid: mine[0] });
  }
  const form = b => jcs([b.state.deadline === undefined ? null : b.state.deadline, b.state.keepers === undefined ? null : b.state.keepers, b.state.currency === undefined ? null : b.state.currency]);
  const b0 = bids[0].bid, b1 = bids[1].bid;
  const currency = b0.state.currency === undefined ? null : b0.state.currency;
  const ks = keepersOf(b0.state.keepers);
  if (form(b0) !== form(b1) || b0.state.deadline === undefined || b0.state.keepers === undefined || b0.state.currency === undefined || ks === null || !isStr(b0.state.deadline)) return empty(currency);
  const timely = b => { const at = receivedAt(b.hash, ks, pool); return isStr(at) && at <= b0.state.deadline; };
  // an opening comes after both bids are in: `needed` keepers received it no earlier than they received the later bid
  const bidAts = bids.map(x => receivedAt(x.bid.hash, ks, pool));
  const laterBid = bidAts.every(isStr) ? bidAts.reduce((m, x) => (x > m ? x : m)) : null;
  const afterBoth = b => { const at = receivedAt(b.hash, ks, pool); return laterBid !== null && isStr(at) && at >= laterBid; };
  const inn = [], opened = [];
  for (const { side, id, bid } of bids) {
    if (!timely(bid)) continue;
    inn.push(side);
    const c = bid.state.commitment;
    if (!isStr(c)) continue;
    const suite = c.startsWith('sm3:') ? 'sm' : 'std';
    const hit = pool.all().filter(b => counts(b, pool) && speakerOf(b, pool) === id && timely(b) && afterBoth(b)).map(b => b.state.opening)
      .find(o => isObj(o) && isStr(o.salt) && RX.salt.test(o.salt) && isStr(o.value) && saltedHash(o.salt, o.value, suite) === c);
    if (hit && /^(0|[1-9][0-9]*)$/.test(hit.value)) opened.push({ side, n: BigInt(hit.value) });
  }
  const most = opened.find(x => x.side === 'to'), least = opened.find(x => x.side === 'from');
  let overlap = null, middle = null;
  if (most && least) {
    if (most.n < least.n) overlap = false;
    else { overlap = true; middle = { minor: minorOut(perUnitBig(most.n + least.n, { value: '2' }, { value: '1' })), currency }; }
  }
  return { quarrel: qh, currency, in: inn.sort(), opened: opened.map(x => x.side).sort(), overlap, middle };
}
// limit_fence: the observe of kind limit for a grant, to hand to write, its audience the autonomous system alone
function limitFence(grantHash, agent, limit, every, salt, each) {
  const state = { kind: 'limit' };
  if (limit !== undefined && limit !== null) state.limit = limit;
  if (each !== undefined && each !== null) state.each = each;
  if (every) state.every = every;
  if (salt) state.salt = salt;
  return { type: 'observe', state, refs: { for: grantHash }, audience: [agent] };
}

// a condition (promises.md, Conditions), a view on the blocks held and the reader's clock: settled, a deed, a sensor's readings, or a signal
// a condition reads three ways (promises.md, Conditions): true, false (also for one of the four shapes written wrong), or null: a condition of any
// other shape is not read by the protocol
function conditionHolds(c, blocks, now) {
  const pool = poolOf(blocks);
  if (!conditionReads(c)) return null;
  // settled: that promise is done, or a refrain elapsed with its price, if any, paid in full (a refrain is never done: decision H15); a stage that says
  // nothing of the price (an open offer, settled by no one) is not paid
  if (isStr(c.settled)) { const p = pool.get(c.settled); const v = p && promiseViewBase(p, pool, { now }); return !!v && (v.stage === 'done' || (v.stage === 'elapsed' && v.paidUp === true)); }
  // accepted: that deal binds, read from its promise fold, no clock (decision H17): accepted or further along, or stopped onward (it bound)
  if ('accepted' in c) { const p = isStr(c.accepted) && pool.get(c.accepted); return !!p && stageBinds(promiseStage(p, pool)); }
  if (isStr(c.deed)) { const b = pool.get(c.deed); return !!b && counts(b, pool); }
  // paid: that deal binds and its price is paid in full (the price side of the deal)
  if ('paid' in c) { const p = isStr(c.paid) && pool.get(c.paid); const v = p && promiseViewBase(p, pool, { now }); return !!v && v.paidUp === true && v.total !== null && v.total !== undefined; }
  // opened: a counted block carries the opening of the commitment (privacy.md): one hash comparison, in the suite the commitment names
  if ('opened' in c) {
    if (!isStr(c.opened)) return false;
    const suite = c.opened.startsWith('sm3:') ? 'sm' : 'std';
    return pool.all().some(b => isObj(b.state.opening) && isStr(b.state.opening.salt) && RX.salt.test(b.state.opening.salt) && b.state.opening.value !== undefined && counts(b, pool) && saltedHash(b.state.opening.salt, b.state.opening.value, suite) === c.opened);
  }
  // by a time (promises.md): within holds when the inner condition held by the deadline, without when it did not
  if ('without' in c || 'within' in c) return byDeadline(c, blocks, pool, now);
  if (c.reading !== undefined) return readingConditionHolds(c, blocks, now);
  // a signal (promises.md, Conditions): by a non-empty list of ids or circle#role, signers a whole number of at least 1, subject one id, op and value
  // together (value an amount); any other shape does not hold
  if (!isStr(c.signal)) return false;
  const nameOk = w => isStr(w) && w !== '' && (!w.includes('#') || (w.split('#').length === 2 && w.split('#').every(x => x !== '')));
  if (!Array.isArray(c.by) || !c.by.length || !c.by.every(nameOk)) return false;
  if (c.signers !== undefined && !(Number.isInteger(c.signers) && c.signers >= 1)) return false;
  // a by that may name more than one signer (two ids, or a role) states how many (decision F2, as E3): with none, the signal does not hold
  if (c.signers === undefined && (c.by.length > 1 || c.by.some(w => w.includes('#')))) return false;
  if (c.subject !== undefined && !isStr(c.subject)) return false;
  const OPS = Object.fromEntries(Object.entries({ lt: k => k < 0, le: k => k <= 0, gt: k => k > 0, ge: k => k >= 0, eq: k => k === 0 }).filter(([k]) => P.condition_ops.includes(k)));
  if ((c.op === undefined) !== (c.value === undefined)) return false;
  if (c.op !== undefined && !(isStr(c.op) && Object.hasOwn(OPS, c.op) && isObj(c.value) && isStr(c.value.value) && RX.decimal.test(c.value.value) && c.value.unit !== undefined)) return false;
  const by = c.by, needed = c.signers === undefined ? 1 : c.signers;
  // the voice is whom the block speaks for (folds.md, Who a block speaks for): its author, or for a block under a grant the grantor
  const voiceOf = o => (o.refs.as === undefined && o.refs.under !== undefined ? (speakerOf(o, pool) || o.refs.author) : o.refs.author);
  // a signer takes their own signal back by defeating it: the defeat is hers when it speaks for the voice the signal speaks for
  const withdrawn = o => pool.all().some(d => asList(d.refs.defeats).includes(o.hash) && voiceOf(d) !== undefined && voiceOf(d) === voiceOf(o) && counts(d, pool));
  const signers = new Set();
  for (const o of pool.all()) {
    if (o.type !== 'observe' || o.state.kind !== c.signal || !isStr(o.state.at) || !(o.state.at <= now) || !counts(o, pool) || withdrawn(o)) continue;
    if (c.subject !== undefined && !asList(o.refs.subject).includes(c.subject)) continue;
    // a `close` reads only when it truly counts: the successor profile's own test (profiles/successor.md, When a close counts)
    if (c.signal === 'close' && !asList(o.refs.subject).some(p => closesOf(p, [], pool).includes(o.hash))) continue;
    if (c.op !== undefined) { const a = o.state.amount; if (!isObj(a) || jcs(a.unit) !== jcs(c.value.unit) || OPS[c.op](decCmp(a.value, c.value.value)) !== true) continue; }
    const author = voiceOf(o);
    if (by.some(w => (w.includes('#') ? membersThen(o, w, pool).includes(author) : w === author))) signers.add(author);
  }
  return quorum(signers, needed);
}

// the protocol reads a condition when it has a key of condition_shapes, and a wrapper only around one it reads
const conditionReads = c => isObj(c) && ('without' in c || 'within' in c ? conditionReads('without' in c ? c.without : c.within) : P.condition_shapes.some(k => k in c));
// what is wrong with a condition's shape, for the shapes the check reads (without, within, opened, paid): null when well formed
function conditionProblem(c) {
  if (!isObj(c)) return null;
  if ('without' in c || 'within' in c) {
    if (Object.keys(c).some(k => !['without', 'within', 'deadline', 'keepers'].includes(k)) || ('without' in c && 'within' in c)) return 'shape';
    if (!(isStr(c.deadline) && timeProblem(c.deadline) === null) || keepersOf(c.keepers) === null) return 'shape';
    const inner = 'without' in c ? c.without : c.within;
    return isObj(inner) ? conditionProblem(inner) : 'shape';
  }
  if ('opened' in c && !(isStr(c.opened) && RX.id.test(c.opened))) return 'shape';
  if ('paid' in c && !(isStr(c.paid) && RX.id.test(c.paid))) return 'shape';
  return null;
}
// a named clock (blocks.md, A named clock): keepers { names, needed }, needed when there is more than one name; null when written wrong
function keepersOf(k) {
  if (!isObj(k) || Object.keys(k).some(x => !P.shapes.keepers.includes(x))) return null;
  if (!Array.isArray(k.names) || !k.names.length || !k.names.every(n => isStr(n) && (RX.id.test(n) || RX.role_ref.test(n)))) return null;
  if (k.needed === undefined) return k.names.length === 1 ? { names: k.names, needed: 1 } : null;
  return Number.isInteger(k.needed) && k.needed >= 1 && k.needed <= k.names.length ? { names: k.names, needed: k.needed } : null;
}
// the voice a keeper's block speaks with: its author when it speaks as a named keeper (an id, the circle it signs as, or a holder of circle#role)
const keeperVoice = (o, ks, pool) => ks.names.some(n => n.includes('#') ? membersThen(o, n, pool).includes(o.refs.author) : (n === o.refs.author || speakerOf(o, pool) === n)) ? o.refs.author : null;
// the needed-th time among the keepers: each keeper counts once, at its earliest time (its latest, for a cutoff)
function kth(voices, needed, latest) {
  const m = new Map();
  for (const [v, t] of voices) { const c = m.get(v); if (c === undefined || (latest ? t > c : t < c)) m.set(v, t); }
  const ts = [...m.values()].sort(); if (latest) ts.reverse();
  return needed <= ts.length ? ts[needed - 1] : null;
}
// when `needed` keepers had each received the block: their counted receipts (observe kind receipt, derives_from the block, state.at)
function receivedAt(target, ks, pool) {
  const voices = [];
  for (const o of pool.all()) { if (o.type !== 'observe' || o.state.kind !== 'receipt' || !asList(o.refs.derives_from).includes(target) || !isStr(o.state.at) || !counts(o, pool)) continue; const v = keeperVoice(o, ks, pool); if (v !== null) voices.push([v, o.state.at]); }
  return kth(voices, ks.needed, false);
}
// a price fixed later (promises.md, Terms, `price`): null when the price is a plain number; else { fixed: false } until the price is fixed, and
// { fixed: true, price: money } once it is. The price names a figure: an observe of kind `figure` made for the deal, with state.money, signed by one
// of the readers `by` names, received by `deadline` on the named clock `keepers`, and inside `min` and `max` when it names them. It is fixed when
// `signers` different readers each signed the same figure and no other figure reached that many; a reader who signed two different figures counts for
// neither. The price is the figure, or `fraction` of it, rounded as a per-unit price is. Nothing is filled in.
function fixingOf(terms, P, pool) {
  const p = terms.price;
  if (!isObj(p) || !('figure' in p)) return null;
  if (figureProblems(p).length) return { fixed: false };
  const ks = keepersOf(p.keepers), by = { names: p.by, needed: 1 };
  const inside = (k, m, bad) => p[k] === undefined || (jcs(p[k].currency) === jcs(m.currency) && !bad(BigInt(m.minor), BigInt(p[k].minor)));
  const votes = [];
  for (const o of pool.all()) {
    if (o.type !== 'observe' || o.state.kind !== p.figure || !asList(o.refs.for).includes(P.hash) || !counts(o, pool)) continue;
    const reader = keeperVoice(o, by, pool);
    if (reader === null) continue;
    const m = o.state.money;
    if (!isObj(m) || !Number.isInteger(m.minor) || m.minor < 0 || m.currency === undefined) continue;
    const at = receivedAt(o.hash, ks, pool);
    if (!(isStr(at) && at <= p.deadline) || !inside('min', m, (v, b) => v < b) || !inside('max', m, (v, b) => v > b)) continue;
    votes.push({ reader, key: jcs(m), m });
  }
  const uniq = votes.filter((v, i) => votes.findIndex(w => w.reader === v.reader && w.key === v.key) === i);
  const once = uniq.filter(v => uniq.filter(w => w.reader === v.reader).length === 1);
  const reached = [];
  for (const v of once) if (once.filter(w => w.key === v.key).length >= p.signers && !reached.some(r => r.key === v.key)) reached.push(v);
  if (reached.length !== 1) return { fixed: false };
  const m = reached[0].m;
  const total = p.fraction !== undefined ? perUnitBig(m.minor, { value: '1' }, { value: p.fraction }) : BigInt(m.minor);
  return { fixed: true, price: { minor: minorOut(total), currency: m.currency } };
}
// the time `needed` keepers have each signed a cutoff through (observe kind cutoff, state.when an instant)
function closedThrough(ks, pool) {
  const voices = [];
  for (const o of pool.all()) { if (o.type !== 'observe' || o.state.kind !== 'cutoff' || !isStr(o.state.when) || timeProblem(o.state.when) !== null || !counts(o, pool)) continue; const v = keeperVoice(o, ks, pool); if (v !== null) voices.push([v, o.state.when]); }
  return kth(voices, ks.needed, true);
}
// the blocks that decide a condition, which a clock must have dated for it to hold by a time
function deciders(c, pool) {
  if ('without' in c || 'within' in c) return deciders('without' in c ? c.without : c.within, pool);
  for (const k of ['settled', 'accepted', 'paid']) if (isStr(c[k])) return pool.all().filter(b => b.hash !== c[k] && asList(b.refs.for).includes(c[k]) && !(b.type === 'observe' && (b.state.kind === 'receipt' || b.state.kind === 'cutoff'))).map(b => b.hash);
  if (isStr(c.deed)) return [c.deed];
  const kind = isStr(c.signal) ? c.signal : c.reading !== undefined && isStr(c.kind) ? c.kind : null;
  if (kind !== null) return pool.all().filter(b => b.type === 'observe' && b.state.kind === kind).map(b => b.hash);
  if ('opened' in c) return pool.all().filter(b => b.state.opening !== undefined).map(b => b.hash);
  return [];
}
function byDeadline(c, blocks, pool, now) {
  if (conditionProblem(c)) return false;
  const negate = 'without' in c, inner = negate ? c.without : c.within, ks = keepersOf(c.keepers);
  if (negate) {
    const over = isStr(now) && now !== '' && now > c.deadline, closed = closedThrough(ks, pool);
    if (!over && !(closed !== null && closed >= c.deadline)) return false;
  }
  const dec = new Set(deciders(inner, pool));
  const inTime = poolOf(blocks).all().filter(b => { if (!dec.has(b.hash)) return true; const r = receivedAt(b.hash, ks, pool); return r !== null && r <= c.deadline; });
  return (conditionHolds(inner, inTime, c.deadline) === true) !== negate;
}

// the pure functions read only what the write check takes (folds.md, What each fold returns): terms_total judges the terms it reads (price, quantity,
// lines) as an offer's and the quantity chosen as an accept's; limit_within_parent judges each fence as a grant's scope. Junk reads as absent.
const pureJunk = (() => {
  const AT = '2026-01-01T00:00:00.000Z', id = c => c.repeat(64);
  const refused = (type, state, refs) => check({ type, state, refs }, [], null).length > 0;
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
// ================================================================ the door: one case per rule
function door(op, ...a) {
  // a list argument (written [...] in the op's args in protocol.json) given as anything but a list, or null, is an argument error: never read as the empty list
  ((P.door.ops[op] || {}).args || []).forEach((spec, i) => {
    if (/^[a-z_]+\??: \[/.test(spec) && a[i] !== undefined && a[i] !== null && !Array.isArray(a[i])) throw argError('argument ' + i + ' is a list');
  });
  switch (op) {
    case 'recovery_reach': return recoveryReachView(a[0], a[1], reachArrivals(a[2], a[3]));
    case 'check_chain': return chainFold(a[0], a[1]);
    case 'fork_pairs': return forkPairs(a[0]);
    // whether a block is its author's word: read in its input with it held (a block no node would take on what it rests on is no one's word)
    case 'signed_by_author': {
      const b = a[0], pool = readWith(a[1], b);
      if (!pool.get(b.hash)) return false;
      if (!isStr(b.refs && b.refs.author)) return soundGenesis(pool.get(b.hash));
      return identityFold(b.refs.author, pool, null, reachArrivals(a[2], a[3]) || undefined).signed_by_author[b.hash] === true;
    }
    case 'header': return header(a[0]);
    case 'open_copy': return openCopy(a[0], a[1]);
    case 'needs': return a[1] === undefined || a[1] === null ? needsOf(a[0]) : unmetIn(a[0], new Pool(a[1]).m);
    case 'accept': { const r = accept(a[0], a[1], pairChoice(a[2], 'takes_pairs'), Array.isArray(a[3]) ? a[3] : undefined); return { ...r, taken: r.taken.map(b => b.hash) }; }
    case 'past_of': return pastOfBlock(a[0], a[1]);
    case 'sees': return pastOfBlock(a[0], a[2]).includes(a[1].hash);
    case 'may_act_as': return mayActAs(a[0], a[1], a[2], a[3]);
    case 'circle_state': return circleState(a[0], a[1], a[2]);
    case 'circle_key': return circleKey(a[0], a[1]); // profiles/rekeys.md
    case 'members_then': return membersThen(a[0], a[1], a[2]);
    case 'operators_of': return operatorsOf(a[0], a[1]);
    case 'under_ok': { const b = a[0], pool = readWith(a[1], b); return !!pool.get(b.hash) && whyNotUnder(b, pool).length === 0; } // a block no node would take is no word
    case 'ownership': return ownershipFold(a[0], a[1], undefined, clock(a[2], false) || '');
    case 'ownership_view': { const p = new Pool([a[0], ...poolOf(a[1]).all()]); p.arrivals = reachArrivals(a[2], a[3]); return ownershipFold(a[0], p, undefined, clock(a[4], false) || ''); }
    case 'where_now': return whereNow(a[0], a[1]);
    case 'shares_on': return sharesOn(a[0], a[1]);
    case 'use_shown': return useShown(a[0], a[1], a[2]);
    case 'not_free_shown': return notFreeShown(a[0], a[1]);
    case 'invasion_shown': return invasionShown(a[0], a[1]);
    case 'release_shown': return releaseShown(a[0], a[1]);
    case 'bids_shown': return bidsShown(a[0], a[1]);
    case 'pot': return potFold(a[0], a[1], clock(a[2], false) || '');
    case 'spec': return { protocol: P };
    // a node's signed answer to a push (nodes.md, Messages): every key but held and at always present; held, when the node gives it, the blocks of
    // the push it already held, ascending (decision F7); at, the node's own time, when it gives one
    case 'push_answer': {
      const parts = isObj(a[0]) ? a[0] : {}, items = k => (Array.isArray(parts[k]) ? parts[k] : []), id = x => (isObj(x) && x.hash !== undefined ? x.hash : x);
      const answer = { node: a[1], taken: items('taken').map(id), waiting: items('waiting').map(id), refused: items('refused').map(r => ({ hash: r.hash === undefined ? null : r.hash, code: r.code === undefined ? null : r.code, detail: r.detail === undefined ? null : r.detail })),
        equivocations: items('equivocations').map(p => [...asList(p)].sort()) };
      if (Array.isArray(parts.held)) answer.held = [...new Set(parts.held.map(id).filter(isStr))].sort();
      if (isStr(parts.at) && timeProblem(parts.at) === null) answer.at = parts.at;
      return signMessage(answer, a[2], a[3] || 'std');
    }
    case 'accept_sealed': { const r = acceptSealed(a[0], a[1], pairChoice(a[2], 'takes_pairs')); return { ...r, taken: r.taken.map(b => b.hash) }; }
    case 'matches': return matches(a[0], a[1], a[2]);
    case 'successor_view': return successorView(a[0], a[1], { now: clock(a[2]), arrivals: arrivalsArg(a[3]) });
    case 'answer_pull': {
      const c = a[4];
      if (!isObj(c) || !Number.isInteger(c.cap) || c.cap < 1) throw argError('choices.cap is a whole number of at least 1: the node states it');
      return answerPull(a[0], a[1], a[2], a[3], { cap: c.cap, serves_pairs: pairChoice(c, 'serves_pairs') }, a[5], a[6], a[7], a[8] === null ? undefined : a[8]);
    }
    case 'keypair': return keypair(a[0], a[1]);
    case 'sign': return signBlock(a[0], a[1], a[2]);
    case 'verify': return verifyBlock(a[0], a[1], a[2]);
    case 'hash': return hashOfBlock({ type: a[0], state: a[1], refs: a[2] }, a[3]);
    case 'valid': return valid(a[0], a[1], a[2]);
    case 'base_fields': return baseFields(a[0]);
    case 'merkle_root': return merkleRoot(a[0]);
    case 'merkle_proof': return merkleProof(a[0], a[1]);
    case 'merkle_verify': return merkleVerify(a[0], a[1], a[2], a[3]);
    case 'limit_commitment': return limitCommitment(a[0], a[1], a[2], a[3], a[4]);
    case 'condition_holds': return conditionHolds(a[0], a[1], clock(a[2], true));
    case 'limit_opens': return limitOpens(a[0], a[1], a[2]);
    case 'terms_total': return pureJunk.terms(a[0], a[1]) ? null : termsTotal(a[0], a[1]);
    case 'add_duration': { if (!(a[2] === undefined || a[2] === null || Number.isInteger(a[2]))) throw argError('the sign is a whole number'); return addDur(a[0], a[1], a[2] === undefined || a[2] === null ? 1 : a[2]); }
    // a pull asks from `since` (0 when it names none); anything but an object is a pull of everything from the start (nodes.md, Pull)
    case 'pull_request': { const r = isObj(a[0]) ? { ...a[0] } : {}; if (r.since === undefined) r.since = 0; return Object.fromEntries(P.messages.pull.filter(k => k in r).map(k => [k, r[k]])); }
    // a block has waited too long when the node's own time since it arrived passes the node's ttl, in whole milliseconds
    case 'waited_too_long': { if (!Number.isInteger(a[2])) throw argError('the time to wait is a whole number of milliseconds'); const s0 = Date.parse(a[0]), n0 = Date.parse(a[1]); return Number.isFinite(s0) && Number.isFinite(n0) && n0 - s0 > a[2]; }
    case 'within_limit': return withinLimit(a[0], a[1], a[2] === undefined || a[2] === null ? 0 : a[2]);
    case 'limit_within_parent': { const at = clock(a[2], true); return !pureJunk.fence(a[0]) && !pureJunk.fence(a[1]) && limitWithinParent(a[0], a[1], at); }
    case 'limit_fence': return limitFence(a[0], a[1], a[2], a[3], a[4], a[5]);
    case 'recovery_key_hash': return recoveryKeyHash(a[0], a[1]);
    case 'salted_hash': return saltedHash(a[0], a[1], a[2]);
    case 'wrap': return wrap(a[0]);
    case 'unwrap': return unwrap(a[0], Array.isArray(a[1]) ? a[1] : undefined);
    case 'id_of': return idOf(a[0], Array.isArray(a[1]) ? a[1] : undefined);
    case 'seal': if (isObj(a[3]) && a[3].vectorsOnly !== true) throw argError('fixed randomness only reproduces a vector: say so with vectorsOnly: true'); return seal(a[0], a[1], a[2], a[3]);
    case 'open': return open(a[0], a[1]);
    case 'cbor_encode': return cborEncode(a[0], a[1]).toString('hex');
    case 'cbor_decode': return cborDecode(a[0], Array.isArray(a[1]) ? a[1] : undefined);
    case 'verify_message': return verifyMessage(a[0], a[1]);
    case 'passkey_challenge': return passkeyChallengeOf(a[0]);
    case 'passkey_signature': return passkeySignature(a[0], a[1], a[2]);
    case 'suite_of_key': return suiteOfKey(a[0]);
    case 'key_timeline': reachArrivals(a[2], a[3]); return identityFold(a[0], a[1]).timeline;
    case 'strict_text': return strictText(a[0]);
    case 'strict_push': return strictPush(a[0]);
    case 'next_link': return nextLink(a[0], a[1]);
    case 'due': return due(a[0], arrivalsArg(a[1]));
    case 'refusals': return refusals(a[0], a[1], a[2], a[3], a[4]);
    case 'promise_view': return promiseView(a[0], a[1], { ...(a[2] || {}), arrivals: reachArrivals(a[2] && a[2].arrivals, a[2] && a[2].unknown_arrival) || undefined, now: clock(a[2] && a[2].now) });
    // many deals of one store, each read as promise_view reads it
    case 'promise_views': { const pool = poolOf(a[1]); const now = clock(a[2] && a[2].now); return Object.fromEntries(asList(a[0]).map(h => { const f = pool.get(h); return [h, f ? promiseView(f, pool, { now }) : null]; })); }
    // the keys that may sign a request (nodes.md, Messages): not void, not frozen, not rotated out
    case 'live_keys': { const f = identityFold(a[0], a[1]); const rotated = new Set(f.rotations.map(r => r.R)); return f.keys.filter(k => !f.frozen.includes(k) && !rotated.has(k)).sort(); }
    case 'promise_stage': return promiseStage(a[0], a[1], a[2]);
    case 'live_grant': return liveGrant(a[0], a[1], clock(a[2], true));
    case 'withdrawal_seen': return withdrawalSeen(a[0], a[1], a[2], arrivalsArg(a[3]));
    case 'consent': return consentFold(a[0], a[1], a[2], isObj(a[3]) ? a[3] : null);
    case 'admission_refusals':
      if (a.length < 4 || !(a[3] === null || isObj(a[3]))) throw argError('admission is the rule\'s state object or an explicit null (no rule): the node states it');
      if (!Number.isInteger(a[4])) throw argError('strangers_today is a whole number: the node states it');
      return admissionRefusals(a[0], a[1], a[2], a[3], a[4]);
    case 'receipt_code': return receiptCode(a[0], a[1]);
    case 'code_matches': return codeMatches(a[0], a[1]);
    case 'residency_refusals': return residencyRefusals(a[0], a[1]);
    case 'earnest_shape_ok': return earnestShapeOk(a[0]);
    case 'earnest_paid': return earnestPaid(a[0], a[1], a[2]);
    case 'reading_is_persons_claim': return readingIsPersonsClaim(a[0], a[1], a[2]);
    case 'reading_condition_holds': return readingConditionHolds(a[0], a[1], clock(a[2], true));
    default: throw new Error('the oracle has no op ' + op);
  }
}

// ================================================================ exports
module.exports = {
  P, door, jcs, canonical, canonOf, hashBytes, hashStr, hashOfBlock, saltedHash, recoveryKeyHash, receiptCode, keypair, signBlock, verifyBlock, verifyBytes, signBytes,
  seal, open, suiteOfKey, encPublicOf, check, refusals, strictText, contentFindings, normHeld, Pool, identityFold, operatorsOf, recoveryReachView, reachArrivals, addDur, valid, validStages,
  cborEncode, cborDecode, cborHeader, cborHeaderDecode, cborEncodePush, cborDecodePush, chainFold, forkPairs, nextLink, header, matches, accept,
  whyNotUnder, liveGrant, withdrawalSeen, circleFold, circleState, mayActAs, membersThen, circleKey, countedIn, promiseStage, promiseView, due, ownershipFold, whereNow,
  successorView, consentFold, admissionRefusals, residencyRefusals, earnestShapeOk, earnestPaid, readingIsPersonsClaim, signMessage, verifyMessage, pullRefusals, pushRefusals,
  answerSignedBy, pushAnswer, pushRequest, wellKnownErrors, announcement, openCopy, headerSignedBy, wrap, unwrap, counts, grantLive,
};
