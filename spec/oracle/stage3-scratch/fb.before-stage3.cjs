'use strict';
// FoodBlock 1.8 (stages 1 and 2: keys, the store) conformance oracle, written from the spec TEXT only (core.md, canonical.md, protocol.md, transport.md,
// protocol.json, modules/*.md, profiles/*.md). Plain Node, built-in crypto, no dependency.
// Where the text is silent a reading is marked GUESS. Where a primitive is not in Node (SM2, SM4-GCM) it is built by hand.
const crypto = require('crypto');
const SUITES = ['std', 'p256', 'sm'];
const SPEC = require('path').join(__dirname, '..') + '/';
// how deep a reader reads what carries a block and the chain of places a thing is in (protocol.json limits.read_depth; encoding.md, Limits)
const READ_DEPTH = require(require('path').join(__dirname, '..') + '/protocol.json').limits.read_depth;
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
// block with no date is cut too. (A block under a grant, decision D14, is the other reading: grantLive keeps a dateless block.)
const ranOut = (grant, block) => { const u = untilMs(grant); return u !== null && (atMs(block) === null || u <= atMs(block)); };
// whether a block is dated at or after `since` (null: any block); a block with no date is not
const datedFrom = (b, since) => since === null || (atMs(b) !== null && atMs(b) >= since);
// the fields that hold each shape (protocol.json field_shape): time, date, duration, or exactly one keyed shape
const fieldsOf = shape => Object.keys(P.field_shape).filter(k => P.field_shape[k] === shape);
const TIME_FIELDS = fieldsOf('time'), DATE_FIELDS = fieldsOf('date'), DURATION_FIELDS = fieldsOf('duration'), BARE_FIELDS = fieldsOf('shape').filter(f => !['voices', 'keepers'].includes(f)); // voices and keepers are read by voicesFindings and keepersOf

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
  if (auth.length !== n || n < P.suites.p256.signature.passkey.min_authenticator_data_bytes || cdj.length === 0 || (auth[32] & 1) === 0) return false;
  const frame = Buffer.from('{"type":"webauthn.get","challenge":"' + passkeyChallenge(bytes) + '","origin":"', 'utf8');
  if (cdj.length < frame.length || !cdj.subarray(0, frame.length).equals(frame)) return false;
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
  return passkeyChallenge(isBlock ? signedBytes(v, 'p256') : Buffer.from(jcs(rest), 'utf8'));
};
// What a key signs for a block (core.md, section 2): the block's header as canonical JSON, the header naming the block by its id in the key's suite and carrying `key`
// when the block names one; a genesis has no header and is signed over its own canonical bytes. Never the block's own bytes otherwise.
const isGenesisBlock = b => isObj(b) && b.type === 'actor' && isObj(b.state) && isObj(b.refs) && (b.refs.author === undefined || 'public_key_sign' in b.state);
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
// the fields each optional profile declares (protocol.json optional_profiles, `fields` by type, `every` for all)
const PROFILE_FIELDS = {};
for (const pr of Object.values(P.optional_profiles)) if (isObj(pr) && isObj(pr.fields)) for (const [t, fs] of Object.entries(pr.fields)) PROFILE_FIELDS[t] = [...new Set([...(PROFILE_FIELDS[t] || []), ...fs])];
PROFILE_FIELDS.every = PROFILE_FIELDS.every || [];
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

// Her list of voices and her clock, as written (identity.md, Her voices; protocol.json shapes.voice and keepers). A voice is exactly one of `key`, `key_hash`, `names` with its
// own optional fields; the first is a key or a key_hash; each key, key_hash and id once in all; a list that states a wait above zero, or any reach, states keepers.
// An empty list is a key grant that ends the identity (identity.md, Her voices).
function voicesFindings(state, type, add) {
  if ('keepers' in state && (type === 'actor' || type === 'grant') && keepersOf(state.keepers) === null) add(2, 'shape', 'state.keepers is { names, needed }: sorted block ids, needed by Counts');
  if ('keepers' in state && type === 'grant' && state.kind === 'key' && !('voices' in state)) add(2, 'shape', 'a key grant states keepers only with voices');
  if (!('voices' in state) || type !== 'grant') return;
  const vs = state.voices;
  if (!Array.isArray(vs)) { add(2, 'shape', 'state.voices is a list of voices'); return; }
  if ('public_key_sign' in state) add(2, 'shape', 'a key grant states voices or one public_key_sign, not both');
  const seen = new Set();
  let needsClock = false;
  vs.forEach((v, i) => {
    if (!isObj(v)) { add(2, 'shape', 'a voice is an object'); return; }
    const kinds = ['key', 'key_hash', 'names'].filter(k => k in v);
    const set = kinds.length === 1 ? P.shapes.voice[kinds[0]] : null;
    if (!set || Object.keys(v).some(k => !set.includes(k))) { add(2, 'shape', 'a voice is exactly one of key, key_hash, names with its own fields'); return; }
    if (i === 0 && kinds[0] === 'names') add(2, 'shape', 'the first voice is a key or a key_hash, never other people');
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
    for (const f of ['wait', 'reach']) if (f in v) { const q = durationProblem(v[f]); if (q) add(2, q, 'voice ' + f); else if (f === 'reach' || !isZeroDur(v[f])) needsClock = true; }
  });
  if (needsClock && !('keepers' in state)) add(2, 'shape', 'a list that states a wait above zero, or any reach, states keepers');
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
    if (isStr(v)) { if (lonePair(v)) add(1, 'not_canonical', 'text that is not well-formed at ' + path.join('.')); return; } // no normal form is checked (core.md, section 3)
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
    if (isObj(v)) for (const [k, x] of Object.entries(v)) { if (lonePair(k)) add(1, 'not_canonical', 'a key that is not well-formed text'); walk(x, [...path, k]); }
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
  for (const k of ['line', 'channel', 'handle']) if (k in state && !isStr(state[k])) add(2, 'shape', 'state.' + k + ' is text');
  // an opening (privacy.md, A commitment) is { salt, value }, the salt in its grammar; a conditioned transfer carries its condition whole (things.md)
  if ('opening' in state && !(isObj(state.opening) && Object.keys(state.opening).every(k => P.shapes.reveal.includes(k)) && isStr(state.opening.salt) && RX.salt.test(state.opening.salt) && state.opening.value !== undefined)) add(2, 'shape', 'state.opening is { salt, value }');
  if ('condition' in state && conditionProblem(state.condition)) add(2, 'shape', 'state.condition');
  // a ruling's up_to is the harm it finds: money, or an amount of a thing (promises.md, A claim of invasion)
  if ('up_to' in state && !['money', 'amount'].includes(shapeOf(state.up_to))) add(2, 'shape', 'state.up_to');
  // the typed fields of a kind (protocol.json kind_fields): `field:shape` lines under a type and a kind; a field that is there must have its shape
  if (isStr(state.kind) && isObj(P.kind_fields[type]) && Array.isArray(P.kind_fields[type][state.kind])) {
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
      else if (shape.startsWith('in:')) { if (!(isStr(v) && closed(shape.slice(3)).includes(v))) add(2, 'shape', where + ' is one of the list'); }
    }
  }
  // marks, on any type, open or closed (things.md): a list of exactly { scheme, value }, both text
  if ('marks' in state && !(Array.isArray(state.marks) && state.marks.every(m => isObj(m) && Object.keys(m).every(k => P.shapes.mark.includes(k)) && isStr(m.scheme) && isStr(m.value)))) add(2, 'shape', 'state.marks lists exact marks [{ scheme, value }]');
  if ('nonce' in state && (!isStr(state.nonce) || !RX.nonce.test(state.nonce))) add(2, 'grammar', 'nonce');
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
    // protocol.json genesis.optional_about: reach and keepers, keepers required with reach
    if ('reach' in state && !('keepers' in state)) bad.push('reach with no keepers');
    if ('reach' in state) { const q = durationProblem(state.reach); if (q) add(2, q, 'state.reach'); } // her first voice's reach is a duration (identity.md, Her voices)
    const allowed = new Set([...P.genesis.required, ...P.key_fields.fields.filter(f => !['roles', 'voices', 'shown_key'].includes(f)), ...P.genesis.private]);
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
  }
  if (out.length) return out;
  // checks 5 and 6 need the pieces (valid), and check 7 is read's (readFindings)
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
    // the machine lock's fields are declared for a grant of kind stop, and `checked` for a lift (authority.md, A machine lock)
    if (type === 'grant' && state.kind === 'stop' && state.status === undefined) for (const k of P.machine_lock.fields) allowed.add(k);
    if (type === 'grant' && state.status === 'lifted') allowed.add('checked');
    for (const k of Object.keys(state)) if (!allowed.has(k)) add(A, 'undeclared_field', k);
    // a key, its suite and her voices are named by a genesis or a key grant alone (core.md, sections 2 and 4): never another actor, never another
    // grant, never a stop or an answer
    const keyHolder = type === 'grant' && state.kind === 'key' && state.status === undefined;
    // a machine lock's own text field `reach` is no voice's reach (00-shared, Open: it goes or is renamed before the last stage)
    const isLock = type === 'grant' && state.kind === 'stop' && state.status === undefined;
    if (keyHolder && 'reach' in state) add(A, 'undeclared_field', 'reach'); // a voice's reach is stated in her list, never on the key grant (identity.md, Her voices)
    if (!keyHolder) for (const k of ['public_key_sign', 'suite', 'reach', 'voices', 'shown_key', ...(type === 'actor' || type === 'grant' ? ['keepers'] : []), ...(type === 'grant' ? ['public_key_encrypt'] : [])]) if (k in state && !(isLock && P.machine_lock.fields.includes(k))) add(A, 'undeclared_field', k);
    for (const k of Object.keys(refs)) if (!SHARED_REFS.has(k) && !roles.includes(k)) add(A, 'undeclared_ref', k);
    // a promise's terms are the protocol's (protocol.json terms) and those its schema declares (state.terms, promises.md, Terms): no fold reads a
    // term it does not know, so a schema's own term binds no one
    if (type === 'promise' && isObj(state.terms)) {
      const declaredTerms = asSchema && isObj(asSchema.state.terms) ? Object.keys(asSchema.state.terms) : [];
      for (const k of Object.keys(state.terms)) if (!P.terms.includes(k) && !declaredTerms.includes(k)) add(A, 'undeclared_field', 'terms.' + k);
    }
  } // a schema named and not held is read's `names_missing` (it is in `needs`), never a field judged against nothing
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
  // the founding block's change lines (circles.md, Versions): [{ rule, needed }], each rule once, needed by Counts (folds.md)
  if (type === 'actor' && 'change' in state && !(Array.isArray(state.change) && state.change.length > 0 && state.change.every(e => isObj(e) && Object.keys(e).every(k => P.circle.change.includes(k)) && isStr(e.rule) && e.rule !== '' && ((Number.isInteger(e.needed) && e.needed >= 1) || e.needed === 'all' || shareOfMembers(e.needed))) && new Set(state.change.map(e => e.rule)).size === state.change.length)) add(A, 'shape', 'state.change is [{ rule, needed }]');
  if (type === 'actor' && 'removal' in state && !(isObj(state.removal) && Object.keys(state.removal).every(k => P.circle.removal.includes(k)) && Number.isInteger(state.removal.needed) && state.removal.needed >= 1)) add(A, 'shape', 'state.removal is { needed: N }');
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
    // a judge's offer that tries to settle first (true), and the part of her fee she gives back if the sides settle (a decimal 0 to 1; needs the conciliation): promises.md, Rulings
    if ('conciliation' in terms && terms.conciliation !== true) add(A, 'shape', 'terms.conciliation is true');
    if ('fee_back' in terms) {
      if (!(isStr(terms.fee_back) && RX.decimal.test(terms.fee_back) && decCmp(terms.fee_back, '0') >= 0 && decCmp(terms.fee_back, '1') <= 0)) add(A, 'shape', 'terms.fee_back is a decimal from 0 to 1');
      else if (terms.conciliation !== true) add(A, 'shape', 'terms.fee_back needs terms.conciliation');
    }
    // which sides may show the deal to a judge or a stranger (privacy.md, Showing a deal): [from], [to] or [from, to]
    if ('show' in terms) { const sh = terms.show; if (!(Array.isArray(sh) && sh.length >= 1 && sh.every(x => x === 'from' || x === 'to') && sh.every((x, i) => i === 0 || sh[i - 1] < x))) add(A, 'shape', 'terms.show lists from and/or to, sorted, each once'); }
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
  if (type === 'grant' && 'fence' in state && !asAnswer) for (const [code, why] of fenceProblems(state.fence)) add(A, code, why);
  if (type === 'grant') for (const [code, why] of lockProblems(state, refs)) add(A, code, why);
  // `lifted` is the status of an updates of a machine lock, a grant: never an answer, never another type's (authority.md, A machine lock)
  if (state.status === 'lifted' && ['promise', 'grant', 'transfer'].includes(type)) {
    if (type !== 'grant' || refs.updates === undefined || refs.answers !== undefined) add(A, 'bad_status', 'lifted is the status of an updates of a machine lock');
    else { const target = held && held.get ? held.get(refs.updates) : undefined; if (target && !isLockBlock(target)) add(A, 'bad_status', 'a lift updates a machine lock'); }
  }
  // a grant's depth is a whole number of 0 or more (authority.md)
  if (type === 'grant' && 'depth' in state && !(Number.isInteger(state.depth) && state.depth >= 0)) add(A, 'shape', 'state.depth is a whole number');
  // terms.needs is data under a schema, never a bare name (promises.md)
  if (type === 'promise' && isObj(state.terms) && 'needs' in state.terms && !(isObj(state.terms.needs) || Array.isArray(state.terms.needs))) add(A, 'shape', 'terms.needs is data from a schema');
  // a successor grant (profiles/successor.md): names the successor (the witnesses are a voice of her list, not a field); it carries decryption keys only (state.keys)
  if (type === 'grant' && state.kind === 'successor' && !asAnswer && state.status === undefined) {
    if (refs.to === undefined) add(A, 'required', 'a successor grant names the successor');
  }
  // many hands (circles.md): state.needed { power: N } for the powers circle.needed lists, N a whole number of at least 1
  if (type === 'actor' && 'needed' in state && !(isObj(state.needed) && Object.entries(state.needed).every(([k, n]) => P.circle.needed.includes(k) && ((Number.isInteger(n) && n >= 1) || n === 'all' || shareOfMembers(n))))) add(A, 'shape', 'state.needed is { power: N }');
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
    // a limit, and a cap on each block, are money or an amount (authority.md); a sealed scope keeps each inside its commitment
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
// ---- a machine lock (authority.md, A machine lock)
// the codes the write check finds in a grant's lock fields, or in the `checked` of a lift
function lockProblems(state, refs) {
  const out = [];
  if (state.status === 'lifted') {
    if ('checked' in state) {
      if (state.checked !== true) out.push(['shape', 'state.checked is true']);
      if (!isStr(refs.confirms)) out.push(['required', 'a lift that says checked names the owner\'s stake in refs.confirms']);
    }
    return out;
  }
  if (state.kind !== 'stop' || state.status !== undefined) return out;
  if (!P.machine_lock.fields.some(k => k in state)) return out;
  if (!('how' in state)) return [['required', 'a machine lock says how it was placed']];
  if (!P.machine_lock.how.includes(state.how)) out.push(['shape', 'state.how']);
  if (!('placer' in state)) out.push(['required', 'state.placer']); else if (idProblem(state.placer) !== null) out.push(['grammar', 'state.placer is an id']);
  if (!('safe' in state)) out.push(['required', 'state.safe']); else if (!(isStr(state.safe) && state.safe !== '')) out.push(['shape', 'state.safe']);
  if ('reach' in state && !(isStr(state.reach) && state.reach !== '')) out.push(['shape', 'state.reach']);
  if (refs.subject === undefined) out.push(['required', 'a machine lock is aimed at the machine: refs.subject']);
  return out;
}
// a grant of kind stop that carries how, no status, and that the write check accepts in its lock fields
const isLockBlock = b => b.type === 'grant' && b.state.kind === 'stop' && 'how' in b.state && b.state.status === undefined && lockProblems(b.state, b.refs).length === 0;
// machineLock(machine, blocks, now): { locked, locks, lifted }
function machineLock(machine, blocks, now) {
  if (!isObj(machine)) throw argError('argument 0 is the machine (a thing block)');
  const pool = new Pool([machine, ...poolOf(blocks).all().filter(x => x.hash !== machine.hash)]);
  const m = machine.hash;
  const isLock = b => isLockBlock(b) && b.refs.answers === undefined && b.refs.subject === m && counts(b, pool);
  // how an effective lift undoes a lock: its placer's, or the owner's with a stake
  const via = (l, lock) => {
    if (l.type !== 'grant' || l.state.status !== 'lifted' || l.refs.updates !== lock.hash || l.refs.answers !== undefined || !counts(l, pool)) return null;
    if (backedIn(l, lock.state.placer, pool).backed) return 'placer';
    const owner = ownershipFold(machine, pool, pool.past(l.hash)).owner;
    const stake = isStr(l.refs.confirms) ? pool.get(l.refs.confirms) : undefined;
    if (owner === null || !stake) return null;
    return l.state.checked === true && backedIn(l, owner, pool).backed && stake.type === 'transfer' && counts(stake, pool) && stake.state.condition !== undefined &&
      stake.refs.for === lock.hash && backedIn(stake, owner, pool).backed ? 'owner' : null;
  };
  const locks = [], lifted = [];
  for (const lock of pool.all().filter(isLock).sort(byHash)) {
    const by = pool.all().map(l => [l.hash, via(l, lock)]).filter(x => x[1] !== null).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    if (by.length) lifted.push({ block: lock.hash, by: by[0][0], via: by[0][1] });
    else if (grantLive(lock, pool) && !(now && isObj(lock.state.scope) && isStr(lock.state.scope.until) && lock.state.scope.until <= now))
      locks.push({ block: lock.hash, how: lock.state.how, reach: lock.state.reach === undefined ? null : lock.state.reach, placer: lock.state.placer, safe: lock.state.safe });
  }
  return { locked: locks.length > 0, locks, lifted };
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
    if (!at) return false;
    const cw = addDur(at, c.work_alone), pw = addDur(at, p.work_alone === undefined ? 'PT0S' : p.work_alone);
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
const READ_ORDER = P.refusals.read;
// read's codes, in the order of protocol.json refusals.read, which lists every code read gives (check 7 finds shape, grammar, decimal, time and calendar in a closed block's
// terms, scope, condition and epoch too).
const readRank = c => (READ_ORDER.includes(c) ? READ_ORDER.indexOf(c) : 100 + CODE_ORDER.indexOf(c));
const inReadOrder = list => uniqueCodes(list).sort((a, b) => readRank(a.code) - readRank(b.code));
// The findings of the first stage that failed, one per code (core.md, section 8: valid stops at the first check that finds anything)
const refusalOf = found => (found.length ? inCodeOrder(found.filter(f => f.stage === Math.min(...found.map(g => g.stage)))) : []);
// A block as a writer must write it: checks 1 to 4, then, for a closed type, check 7 with no block held and no schema. (What the pure functions read: pureJunk.)
function writeFindings(block) {
  const early = contentFindings(block, {});
  if (early.length) return refusalOf(early);
  const b = blockOnly(block), found = [];
  if (CLOSED.has(b.type) && !isGenesisBlock(b)) closedFindings(b, { held: new Map(), schemas: new Map() }, (stage, code, detail) => found.push({ stage, code, detail }));
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
    if (d > READ_DEPTH) fail('too deep');
    const c = text[i];
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
    for (const [w, v] of [['true', true], ['false', false], ['null', null]]) if (text.startsWith(w, i)) { i += w.length; return v; }
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
  return named(text, refusalOf(contentFindings(r.value, {})));
}

// A push read from its bytes (nodes.md, Push): one message, canonical whole, else `not_canonical` for the whole push (a message code) and nothing in it is judged.
// Else each message's block as its own bytes say (strictText), a sealed message none. Text that is JSON but no push is an argument error.
function strictPush(text) {
  if (typeof text !== 'string') throw argError('a push is JSON text');
  const r = wireParse(text);
  if (!r.ok) return named(text, [{ code: 'not_canonical', detail: r.why }]); // the push refused as one message: a list of one refusal (protocol.json door.ops.strict_push)
  const v = r.value;
  if (!isObj(v) || !Array.isArray(v.messages)) throw argError('a push is { messages, for }');
  // the push is canonical whole, so the bytes of each block are the canonical bytes of its value, as they came
  return v.messages.map(m => (isObj(m) && 'block' in m ? strictText(jcs(m.block)) : []));
}

// ================================================================ blocks held, causal past (blocks.md)
// A block's causes: every block it names in refs, and the block it counts to (protocol.json causal_state).
const refIds = b => { const out = []; for (const v of Object.values(b.refs || {})) for (const x of asList(v)) if (isStr(x)) out.push(x); for (const k of P.causal_state) if (b.state && isStr(b.state[k])) out.push(b.state[k]); return out; };
// What a block names for its meaning (protocol.json needs): refs.under, answers, updates, for, and by type its schema, the grant it passes on, the block it
// counts to, a grant's scope.on. `read` waits for these and `valid` for none of them: never its author or its prev (core.md, section 8). Ascending.
function needsOf(b) {
  const out = [];
  for (const path of [...P.needs.every, ...(P.needs[b.type] || [])]) {
    const [side, key] = path.split('.');
    const root = side === 'refs' ? b.refs : side === 'state' ? b.state : (isObj(b.state) ? b.state[side] : undefined); // `scope.on` is state.scope.on
    const v = isObj(root) ? root[key] : undefined;
    for (const x of asList(v)) if (isStr(x) && x !== '' && !out.includes(x)) out.push(x);
  }
  return out.sort(); // nodes.md, Push: needs ascending
}

// ================================================================ what a reader holds: valid, read, or kept as its header (core.md, section 8)
// An entry is a whole block { hash, type, state, refs, signature } or a block held by its header alone: { hash, state: { seq, audience: ['sealed'], skip?, withheld? },
// refs: { author, prev }, keyId, header_signature } (no type). A block that is valid and not read is kept as its header (asHeader) and keeps its body out of reach of every
// fold (`_body` is for the pieces of another block only: a key grant that is valid brings its key in whether or not this reader can read it).
const bodyOf = e => (e && e.type !== undefined ? e : (e && e._body) || null);
const keyRefOf = e => (e.type === undefined ? e.keyId : e.refs.key);
function asHeader(b) {
  const h = { hash: b.hash, state: { seq: b.state.seq, audience: ['sealed'] }, refs: { author: b.refs.author, prev: b.refs.prev }, header_signature: b.signature };
  if (b.refs.key !== undefined) h.keyId = b.refs.key;
  for (const f of ['skip', 'withheld']) if (b.state[f] === true) h.state[f] = true;
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
  for (const flag of ['withheld', 'skip']) if (flag in h) out.state[flag] = h[flag];
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
  if (e.bad_header) bad.push('a header is exactly author, seq, prev and hash, with key, withheld or skip');
  if (!Number.isInteger(e.state.seq) || e.state.seq < 1) bad.push('seq');
  for (const [k, v] of [['author', e.refs.author], ['prev', e.refs.prev], ['hash', e.hash], ['key', e.keyId]]) if (v !== undefined || k !== 'key') { const p = idProblem(v); if (p) return [{ stage: 2, code: p === 'unknown_suite' ? 'unknown_suite' : 'shape', detail: 'header ' + k }]; }
  for (const f of ['skip', 'withheld']) if (f in e.state && e.state[f] !== true) bad.push(f);
  if (!isStr(e.header_signature)) bad.push('header_signature');
  return bad.length ? [{ stage: 2, code: 'shape', detail: 'a header: ' + bad.join(', ') }] : [];
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
  const early = full ? contentFindings(b, {}) : headerShape(e);
  if (early.length) return first(early);
  // a genesis has no pieces and opens with its own key over its own bytes (check 6)
  if (full && isGenesisBlock(b)) {
    const key = b.state.public_key_sign, w = [];
    if (!isStr(e.signature) || !verifyBlock(b, e.signature, key)) w.push({ code: 'bad_genesis', detail: 'a genesis is signed by its own key' });
    if (e.hash !== undefined && hashOfBlock(b, suiteOfKey(key) || suiteFromBlock(b)) !== e.hash) w.push({ code: 'bad_hash', detail: 'the id is not the hash of the canonical bytes in its key\'s suite' });
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
  for (const c of cands) {
    if (!SUITES.includes(c.suite) || !keyGrammar(c.suite).test(c.key)) { unknown = true; continue; }
    if (!hit && entryOpens(e, c.key, c.suite)) hit = c;
  }
  if (!hit) return found(6, [{ code: unknown ? 'unknown_suite' : 'bad_signature', detail: unknown ? 'a key in a suite this reader does not know' : 'no key its pieces name opens the signature over its header' }]);
  // the signature is read over the header that names the block by the id a reader computes, never one it was sent (core.md, section 1); an id sent that is not that id is `bad_hash`
  if (full && e.hash !== undefined && hashOfBlock(b, hit.suite) !== e.hash) return found(6, [{ code: 'bad_hash', detail: 'the id is not the hash of the canonical bytes in its key\'s suite' }]);
  return { stage: 0, findings: [], needs: [] };
}
// the schema store of whole blocks: every thing of kind schema, once per id (core.md, section 8)
const schemasMap = list => new Map(list.filter(b => isObj(b) && b.type === 'thing' && isObj(b.state) && b.state.kind === 'schema' && isStr(b.hash)).map(b => [b.hash, b]));
// read(b): the codes of one valid block against what is held and read (core.md, section 8): names_missing, names_unread (naming the ids in the detail; `needs` gives them), then check 7.
function readCodes(b, st) {
  const miss = [], unread = [], out = [];
  for (const id of needsOf(b)) { if (!st.idx.has(id)) miss.push(id); else if (!(st.validE.has(id) && st.status.get(id) === 'read')) unread.push(id); }
  if (miss.length) out.push({ stage: 0, code: 'names_missing', detail: 'not held: ' + miss.join(', ') });
  if (unread.length) out.push({ stage: 0, code: 'names_unread', detail: 'held and not valid or not read: ' + unread.join(', ') });
  if (CLOSED.has(b.type) && !isGenesisBlock(b)) closedFindings(blockOnly(b), { held: st.bodies, schemas: st.schemas }, (stage, code, detail) => out.push({ stage, code, detail }));
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
  forget() { this.folds = new Map(); this.memo = new Map(); this._eq = null; this._sg = null; }
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
const soundGenesis = g => !!g && g.type === 'actor' && g.refs.author === undefined && isStr(g.state.public_key_sign) && g.state.seq === undefined && isStr(g.signature) && verifyBytes(Buffer.from(canonOf(g), 'utf8'), g.signature, g.state.public_key_sign, g.state.suite || 'std');
// autonomous(id, pool): an autonomous system is an actor of kind agent or machine; with `operated`, also any actor an operator answers for (identity.md, consent.md)
const autonomous = (id, pool, operated = false) => { const g = pool.get(id); return (!!g && ['agent', 'machine'].includes(g.state.kind)) || (operated && isStr(id) && operatorsOf(id, pool).length > 0); };
const isKeyGrant = b => b.type === 'grant' && b.state && b.state.kind === 'key';
// a key grant about the identity: `refs.subject` her id, no status (a block with a status is a stop or an answer, never a grant: authority.md)
const keyGrantOf = (b, id) => !!b && isKeyGrant(b) && b.refs.subject === id && b.state.status === undefined;
// identity.md, Her voices: the suite's hash of a key's SPKI hex as UTF-8 text
const keyHash = (spki, suite) => hashStr(suite || 'std', spki);
const isZeroDur = d => { const p = parseDur(d); return !!p && Object.values(p).every(n => n === 0); };
// the operator grant a key grant names in refs.under: a grant of kind operator naming the author in refs.to, by the key grant's own author (identity.md, Autonomous systems and machines)
const operatorGrantUnder = (kg, id, pool) => {
  const g = isStr(kg.refs.under) ? pool.get(kg.refs.under) : null;
  return g && g.type === 'grant' && g.state.kind === 'operator' && g.refs.to === id && g.refs.subject === undefined && g.state.status === undefined && isStr(g.refs.author) && g.refs.author === kg.refs.author ? g : null;
};
// The list a block states (identity.md, Her voices): the genesis (a list of one voice, its own key) or a key grant that states `voices`.
function listOfBlock(b, id) {
  if (!b) return null;
  if (b.hash === id) return soundGenesis(b) ? { hash: id, voices: [{ key: b.state.public_key_sign, ...(b.state.suite !== undefined ? { suite: b.state.suite } : {}), ...(b.state.reach !== undefined ? { reach: b.state.reach } : {}) }], keepers: b.state.keepers !== undefined ? b.state.keepers : null } : null;
  if (keyGrantOf(b, id) && Array.isArray(b.state.voices)) return { hash: b.hash, voices: b.state.voices, keepers: b.state.keepers !== undefined ? b.state.keepers : null };
  return null;
}
// the key_hash voice of a list that a key hashes to (its suite's hash of the SPKI hex), or undefined
const matchHash = (list, key) => (list ? list.voices.find(v => isObj(v) && isStr(v.key_hash) && isStr(key) && keyHash(key, v.suite) === v.key_hash) : undefined);
// The keys a block brings in for an author (core.md, section 5; protocol: 00-shared, refs.key): the genesis's own; each `key` voice of the list a key grant states;
// the one `public_key_sign` a key grant adds under a voice. (A key named by hash comes in by showing itself: resolveKeys.)
function keysBroughtBy(p, author) {
  if (!p) return [];
  if (p.hash === author) return soundGenesis(p) ? [{ key: p.state.public_key_sign, suite: p.state.suite || 'std' }] : [];
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
  if (isKeyGrant(b) && isStr(b.state.shown_key)) { const hv = matchHash(listOfBlock(kg, author), b.state.shown_key); if (hv) out.push({ key: b.state.shown_key, suite: hv.suite || 'std' }); }
  // a later block of a shown key names the key grant that showed it: the key stated in its shown_key, when that grant's own refs.key names a list with the hash
  if (isStr(kg.state.shown_key)) { const hv = matchHash(listOfBlock(at(kg.refs.key), author), kg.state.shown_key); if (hv) out.push({ key: kg.state.shown_key, suite: hv.suite || 'std' }); }
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
function emptyIdentity() { return { signed_by_author: {}, keys: [], voices: [], keepers: null, waiting: [], operators: [], info: new Map(), keyMap: new Map(), timeline: [], genKey: null, idSuite: 'std', closed: false, kgStands: null, twiceOf: null, reachOf: null, witnessGrantStands: null, endsOfKey: null }; }
function identityFold(id, poolIn) {
  const pool = poolOf(poolIn);
  const key = 'id:' + id;
  if (pool.folds.has(key)) return pool.folds.get(key);
  const res = computeIdentity(id, pool, false);
  pool.folds.set(key, res);
  return res;
}
// an operator's identity as the operator route reads it: without the operator's own operators (so no loop), cached apart
function plainIdentityFold(id, pool) {
  const k = 'plain:' + id;
  if (!pool.folds.has(k)) pool.folds.set(k, computeIdentity(id, pool, true));
  return pool.folds.get(k);
}
function computeIdentity(id, pool, plain) {
  const g = pool.get(id);
  if (!g || g.type !== 'actor' || g.refs.author !== undefined || !isStr(g.state.public_key_sign)) return emptyIdentity();
  const genKey = g.state.public_key_sign, idSuite = g.state.suite || 'std';
  const all = pool.all();
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
  const idOf = a => (a === id ? self.fold : (plain ? plainIdentityFold(a, pool) : identityFold(a, pool)));
  // whether a block counts for its own author: read in the author's own fold
  const countedBy = b => (b.refs.author === id ? cb(b.hash) : (isStr(b.refs.author) ? idOf(b.refs.author).signed_by_author[b.hash] === true : true));
  const hasKey = (list, X) => list.voices.some(v => isObj(v) && (v.key === X || (isStr(v.key_hash) && keyHash(X, v.suite) === v.key_hash)));
  const keyAt = (v, X) => isObj(v) && (v.key === X || (isStr(v.key_hash) && keyHash(X, v.suite) === v.key_hash));
  const hasCloses = all.some(b => b.type === 'observe' && b.state.kind === 'close');
  const closedIn = S => hasCloses && closesOf(id, [], pool, h => inS(S, h), b => countedBy(b)).length > 0;

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
  // ---- who signed a key grant, as which voice of the list standing in its own past: { p, kind: key | names | operator, X, voice }
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
      else if (!plain) { const og = operatorGrantUnder(k, id, pool); if (og && operatorsOf(id, pool, k, og.hash).includes(P_)) r = { p: -1, kind: 'operator', X: null, voice: null }; }
    }
    memo.sg.set(k.hash, r);
    return r;
  }
  // ---- does a block count for its author (signed_by_author)
  // cb: the base count the chain of lists is built from (the key is a voice of the list standing in the block's causal past, or under one); counted adds the cuts that
  // read the chain whole (a suite move; an end a keeper's line held before her receipt of the block), so the chain never reads its own cuts
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
    for (const E of suiteMoves(s.key)) if (!pastOf(E.hash).has(h)) return false;
    // an end of its key that stands among the blocks held and that it has seen (blocks.md, The cut, Seen)
    const clock = keepersOf(reachClock(b));
    return !keyEnds(b).some(E => seenEnd(b, E, clock));
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
  // the standing key grants that put a key of another suite in a key's place
  function suiteMoves(X) {
    const ch = chain(null), out = [];
    for (let i = 1; i < ch.length; i++) {
      const p = ch[i - 1].list.voices.findIndex(v => keyAt(v, X)), after = p >= 0 && !hasKey(ch[i].list, X) ? ch[i].list.voices[p] : null; // the key is out of the list and another suite's key is in its place
      if (after && !keyAt(after, X) && (isObj(after) && (after.suite || 'std')) !== (suiteOfKey(X) || 'std')) out.push(ch[i].via);
    }
    return out;
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
    if (B && B.type === 'actor' && B.refs.author === undefined && soundGenesis(B)) spec = { author: B.hash, key: B.state.public_key_sign, after: 0 };
    // a key grant that brings in one key (a key under a voice) names that key's line, whole; any other block, its own key's blocks after it
    else if (B && isKeyGrant(B) && !Array.isArray(B.state.voices) && isStr(B.state.public_key_sign) && isStr(B.refs.subject)) spec = { author: B.refs.subject, key: B.state.public_key_sign, after: 0 };
    else if (B && isStr(B.refs.author) && Number.isInteger(B.state.seq)) { const s = signerFrom(B, pool); if (s) spec = { author: B.refs.author, key: s.key, after: B.state.seq }; }
    lineCache.set(n, spec);
    return spec;
  }
  // a keeper's line: that block's key's blocks after it, counted, by seq, read in S (null: all held)
  function lineBlocks(n, S) {
    const spec = lineSpec(n);
    if (!spec) return [];
    return all.filter(x => x.refs.author === spec.author && x.hash !== n && Number.isInteger(x.state.seq) && x.state.seq > spec.after && inS(S, x.hash) && (() => { const s = signerFrom(x, pool); return !!s && s.key === spec.key; })() && (spec.author === id ? cb(x.hash) : idOf(spec.author).signed_by_author[x.hash] === true))
      .sort((a, b) => a.state.seq - b.state.seq);
  }
  const receiptOn = (line, h) => line.find(x => x.type === 'observe' && x.state.kind === 'receipt' && asList(x.refs.derives_from).includes(h));
  // which came first: read from a line's order, never from dates: true when her receipt of `a` comes before her receipt of `b` on the line n names
  function firstOnLine(a, b, n, S) {
    const line = lineBlocks(n, S), ra = receiptOn(line, a), rb = receiptOn(line, b);
    if (!ra || !rb || ra === rb) return null; // one receipt that names several blocks gives them no order
    return ra.state.seq < rb.state.seq;
  }
  // a wait has run (blocks.md, A named clock): `needed` lines each hold her receipt of the word and, after it, a cutoff through that receipt plus the wait that
  // is not shown false (a receipt after it on her line, dated at or before its instant, of a block the word's rule reads: the word or a key grant of hers).
  // 'denied' when a line holds, before its closing cutoff, a receipt of a block that sets the word aside (a no, an end): one line is enough to narrow; else 'pending'
  const readsOf = w => h => h === w.hash || (() => { const x = pool.get(h); return !!x && keyGrantOf(x, id); })();
  function waitRun(w, wait, keepers, S, blockers) {
    if (isZeroDur(wait)) return 'run';
    const ks = keepersOf(keepers);
    if (!ks) return 'pending';
    const reads = readsOf(w);
    let closed = 0;
    for (const n of ks.names) {
      const line = lineBlocks(n, S), r = receiptOn(line, w.hash);
      if (!r || !isStr(r.state.at)) continue;
      const T = addDur(r.state.at, wait);
      if (T === null) continue;
      const shownFalse = c => line.some(x => x.state.seq > c.state.seq && x.type === 'observe' && x.state.kind === 'receipt' && isStr(x.state.at) && x.state.at <= c.state.when && asList(x.refs.derives_from).some(reads));
      const c = line.find(x => x.type === 'observe' && x.state.kind === 'cutoff' && x.state.seq > r.state.seq && asList(x.refs.subject).includes(w.hash) && isStr(x.state.when) && x.state.when >= T && !shownFalse(x));
      if (!c) continue;
      if (line.some(x => x.state.seq < c.state.seq && x.type === 'observe' && x.state.kind === 'receipt' && asList(x.refs.derives_from).some(h => blockers.has(h)))) return 'denied';
      closed++;
    }
    return closed >= ks.needed ? 'run' : 'pending';
  }
  // a voice as a value to compare: who it is (key, key_hash, or names with needed), its suite (std when left out), its wait and its reach
  const voiceOf = v => (isObj(v) ? jcs({ who: isStr(v.key) ? ['key', v.key] : isStr(v.key_hash) ? ['hash', v.key_hash] : ['names', v.names, v.needed === undefined && Array.isArray(v.names) && v.names.length === 1 ? 1 : v.needed], suite: v.suite || 'std', wait: v.wait === undefined ? null : v.wait, reach: v.reach === undefined ? null : v.reach }) : 'none');
  const sameVoices = (a, b) => a.length === b.length && a.every((v, i) => voiceOf(v) === voiceOf(b[i]));
  // the place another's key grant (or confirm) for her list speaks from in L: her operator (-1), or the voice of named people its author is one of
  const placeOfOther = (x, L) => { if (!plain && operatorsOf(id, pool).includes(x.refs.author)) return -1; const i = L.voices.findIndex(v => isObj(v) && Array.isArray(v.names) && v.names.includes(x.refs.author)); return i >= 0 ? i : null; };
  // the place a block of hers or for her list speaks from, in L: { p, under } (p -1 for her operator), or null
  const placeIn = (x, L) => { if (x.refs.author === id) { const s2 = info.get(x.hash), Px = pastOf(x.hash), pl = s2 && placeOfKey(s2.key, L, Px); return pl || null; } const p = placeOfOther(x, L); return p === null ? null : { p }; };
  // a voice above sg's place has signed w (named it in refs.confirms of a counted block): a higher voice of the list (for a key under a voice, its own voice
  // too), named people `needed` of them, or her operator
  function aboveSigned(w, sg, S) {
    if (sg.kind === 'operator') return false;
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
  // (nos) on one keeper's line before her closing cutoff, or in a second signing's causal past, sets it aside: { never }. Else it waits: on `wait` while the wait has
  // not run on her clock, then on `confirm`.
  function twice(w, sg, L, S, nos) {
    if (aboveSigned(w, sg, S)) return { stands: true };
    const wait = sg.kind === 'operator' || sg.p === 0 ? 'PT0S' : (isObj(sg.voice) ? sg.voice.wait : undefined);
    if (wait === undefined) return { stands: false, on: 'confirm' }; // a voice that states no wait brings in nothing by itself
    const zero = isZeroDur(wait), blockers = new Set(nos.map(N => N.hash));
    const onClock = Sx => waitRun(w, wait, L.keepers, Sx, blockers);
    if (!zero && onClock(S) === 'denied') return { never: true, stands: false };
    const mine = c => (sg.kind === 'operator' ? c.refs.author === w.refs.author : sg.kind === 'names' ? sg.voice.names.includes(c.refs.author) : (c.refs.author === id && !!info.get(c.hash) && info.get(c.hash).key === sg.X));
    const again = all.filter(c => c.hash !== w.hash && asList(c.refs.confirms).includes(w.hash) && inS(S, c.hash) && countedBy(c) && mine(c));
    if (again.some(c => nos.some(N => pastOf(c.hash).has(N.hash)))) return { never: true, stands: false };
    const after = c => zero || onClock(pastOf(c.hash)) === 'run';
    if (sg.kind === 'names') {
      const v = sg.voice, need = Number.isInteger(v.needed) ? v.needed : (v.names.length === 1 ? 1 : null);
      // each of them signs it twice: the key grant itself or an earlier confirm of theirs in this one's causal past, then this one after the wait
      const ids = new Set(again.filter(c => after(c) && (c.refs.author === w.refs.author || again.some(e => e !== c && e.refs.author === c.refs.author && pastOf(c.hash).has(e.hash)))).map(c => c.refs.author));
      if (need !== null && ids.size >= need) return { stands: true };
    } else if (again.some(after)) return { stands: true };
    return { stands: false, on: !zero && onClock(S) !== 'run' ? 'wait' : 'confirm' };
  }
  // a voice restates every voice above its place as it was, and its own place's wait and reach as they were (a new key may go in its own place; a voice of named
  // people stays as it was); only the first voice changes keepers; a voice that leaves its own place out adds nothing below it, bar taking itself out
  const restates = (k, Lk, sg) => {
    if (sg.kind === 'operator') return true;
    const nv = k.state.voices, ov = Lk.voices, i = sg.p;
    if (nv.length < i || !sameVoices(nv.slice(0, i), ov.slice(0, i))) return false;
    if (i !== 0 && jOf(k.state.keepers) !== jOf(Lk.keepers)) return false;
    if (nv.length === i || sameVoices(nv, ov.filter((_, j) => j !== i))) return true;
    const o = ov[i], n = nv[i];
    if (!isObj(o) || !isObj(n) || jOf(o.wait) !== jOf(n.wait) || jOf(o.reach) !== jOf(n.reach)) return false;
    if (Array.isArray(o.names)) return voiceOf(o) === voiceOf(n);
    return !Array.isArray(n.names);
  };
  // taking oneself out: the list is the old one without the signer's own place, the clock unchanged, no key added
  const selfOut = (k, Lk, sg) => sg.p >= 0 && sameVoices(k.state.voices, Lk.voices.filter((_, i) => i !== sg.p)) && jOf(k.state.keepers) === jOf(Lk.keepers) && k.state.public_key_sign === undefined && k.state.shown_key === undefined;
  // a key grant that only narrows (blocks.md, Finality, Signed twice): it adds and shows no key, and its list is the old one with voices left out, each kept one as
  // it was, the clock unchanged
  const narrows = (k, Lk) => {
    if (k.state.public_key_sign !== undefined || k.state.shown_key !== undefined) return false;
    if (!Array.isArray(k.state.voices)) return true;
    if (jOf(k.state.keepers) !== jOf(Lk.keepers)) return false;
    let j = 0;
    return k.state.voices.every(v => { while (j < Lk.voices.length && voiceOf(Lk.voices[j]) !== voiceOf(v)) j++; return j++ < Lk.voices.length; });
  };
  // a "no" (identity.md, Saying no is signing): another key grant stating a list for the same list, counted, by a voice above the grant's signer
  const nosOf = (k, Lk, sg) => (Array.isArray(k.state.voices) ? lists.filter(N => N !== k && N.refs.updates === Lk.hash && countedBy(N) && (() => { const pl = placeIn(N, Lk); return !!pl && !pl.under && pl.p < sg.p; })()) : []);
  // two key grants of one voice, neither in the other's causal past (identity.md, Two by one voice)
  const paired = (k, sg, Lk, S) => kgs.some(k2 => {
    if (k2 === k || !inS(S, k2.hash) || pool.sees(k.hash, k2.hash) || pool.sees(k2.hash, k.hash) || !countedBy(k2)) return false;
    if (sg.kind === 'operator') return k2.refs.author === k.refs.author;
    if (k.refs.author === id) return k2.refs.author === id && !!info.get(k2.hash) && info.get(k2.hash).key === sg.X;
    return k2.refs.author !== id && k2.refs.updates === k.refs.updates && placeOfOther(k2, Lk) === sg.p;
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
    if (closedIn(Kp)) return never; // after a counted close no key grant of hers counts
    if (sg.kind === 'names') {
      const v = sg.voice, need = Number.isInteger(v.needed) ? v.needed : (v.names.length === 1 ? 1 : null);
      const ids = new Set([k.refs.author, ...all.filter(c => asList(c.refs.confirms).includes(k.hash) && inS(S, c.hash) && v.names.includes(c.refs.author) && countedBy(c)).map(c => c.refs.author)]);
      if (need === null || ids.size < need) return { stands: false, on: 'confirm' };
    }
    if (!isList && !isStr(k.state.public_key_sign) && !isStr(k.state.shown_key) && isStr(k.state.public_key_encrypt)) return { stands: true, free: true }; // an encryption key lets no one act
    if (isList && selfOut(k, Lk, sg)) return { stands: true, free: true }; // taking oneself out: it stands when signed
    if (paired(k, sg, Lk, S)) return never;
    if (narrows(k, Lk)) return { stands: true }; // a word that only narrows is not signed twice
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
    const r = waitRun(w, v.reach, L.keepers, Sx, ends);
    return r === 'run' ? { ok: true } : r === 'denied' ? { ok: false, never: true } : { ok: false };
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
  // a block has seen an end (blocks.md, The cut, Seen): the end is in its causal past, or, where its key names a clock, one keeper's line holds her receipt of the end
  // before her receipt of the block. A block that signs the end again has not seen it: the end stands only by it.
  const seenEnd = (b, E, clock) => !asList(b.refs.confirms).includes(E.hash) && (pastOf(b.hash).has(E.hash) || (!!clock && clock.names.some(n => firstOnLine(E.hash, b.hash, n, null) === true)));
  // named: a block names a word in any ref but prev and after, or in state.counted_to
  const namesIt = (x, h) => Object.entries(x.refs).some(([k, v]) => k !== 'prev' && k !== 'after' && asList(v).includes(h)) || x.state.counted_to === h;
  // a block passes an end of its key (or, with E null, the ends that may yet come): inside its cut; her own later counted block names it; or, where the key names a
  // clock, `needed` lines received it before any received the end; where it names none, a relier's counted block uses it
  function passesEnd(b, E, clock) {
    if (E && (E.hash === b.hash || pastOf(E.hash).has(b.hash))) return true;
    const users = all.filter(o => o.hash !== b.hash && namesIt(o, b.hash) && (!E || !pastOf(o.hash).has(E.hash)) && countedBy(o));
    if (users.some(o => o.refs.author === id)) return true;
    if (clock) {
      const lines = clock.names.filter(n => { const line = lineBlocks(n, null), r = receiptOn(line, b.hash); if (!r) return false; const re = E && receiptOn(line, E.hash); return !re || re.state.seq > r.state.seq; });
      return lines.length >= clock.needed;
    }
    return users.some(o => !operatorsOf(o.refs.author, pool).includes(id) && !(isStr(o.refs.under) && pool.get(o.refs.under) && pool.get(o.refs.under).refs.author === id));
  }
  // 'never' when it has seen an end, 'passed' when it has passed each, else 'waiting'
  function cutOf(b) {
    const ends = keyEnds(b), clock = keepersOf(reachClock(b));
    if (ends.some(E => seenEnd(b, E, clock))) return 'never';
    return (ends.length ? ends.every(E => passesEnd(b, E, clock)) : passesEnd(b, null, clock)) ? 'passed' : 'waiting';
  }
  // the clock a word of hers reads its ends on: the list's keepers, when the voice of its key states a reach (the key names a clock exactly then: identity.md, Ending a key)
  function reachClock(w) {
    const s = info.get(w.hash);
    if (!s) return null;
    const Wp = pastOf(w.hash), L = standing(Wp), pl = placeOfKey(s.key, L, Wp), v = pl && L.voices[pl.p];
    return isObj(v) && v.reach !== undefined ? L.keepers : null;
  }
  // a death recorded: a key grant that stands in S, signed by a voice of named people, and leaves no voice at their place or below (profiles/successor.md)
  // the successor is never one of the witnesses: a record by a voice that names him counts for nothing
  function witnessGrantStands(S, successor) {
    const ch = chain(S);
    for (let i = 1; i < ch.length; i++) { const sg = kgSigner(ch[i].via); if (sg && sg.kind === 'names' && ch[i].list.voices.length <= sg.p && !sg.voice.names.includes(successor)) return true; }
    return false;
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
  const out = {
    signed_by_author: authoredProxy, info, keyMap, genKey, idSuite,
    get keys() {
      const L = standing(null), ks = new Set();
      for (const v of L.voices) if (isObj(v) && isStr(v.key)) ks.add(v.key);
      for (const X of shownKeys(L)) ks.add(X);
      for (const U of unders) if (!ks.has(U.state.public_key_sign) && underPlace(U, null) !== null) ks.add(U.state.public_key_sign);
      return L.voices.length ? [...ks].sort() : [];
    },
    get voices() { return standing(null).voices; },
    get keepers() { return standing(null).keepers; },
    get closed() { return standing(null).voices.length === 0; },
    get operators() { return operatorsOf(id, pool); },
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
    kgStands: (k, S) => kgStands(k, S === undefined ? null : S), twiceOf, reachOf, reachClock, cutOf, witnessGrantStands, endsOfKey, standingAt: S => standing(S), kgSigner, lineBlocks, receiptOn,
  };
  self.fold = out;
  return out;
}
// keepers { names, needed } (blocks.md, A named clock), checked as written: each name a block id, needed by Counts (a set of one needs none); null when written wrong
function keepersOf(k) {
  if (!isObj(k) || Object.keys(k).some(x => !P.shapes.keepers.includes(x))) return null;
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
  if (b.state.status !== undefined || b.refs.answers !== undefined) return false;
  if (b.type === 'grant') return b.state.kind !== 'key' && b.state.kind !== 'stop';
  if (b.type === 'observe') return b.state.kind === 'account';
  if (b.type === 'transfer') return asList(b.refs.what).some(h => { const c = pool.get(h); return !!c && (c.type === 'promise' || (c.type === 'observe' && c.state.kind === 'invasion')); });
  return false;
}
// what `stands` lists, in this order (protocol.json door.ops.stands)
const ON = ['wait', 'reach', 'confirm', 'end', 'named', 'condition'];
// Finality (blocks.md): does a word stand, read on the blocks held. { stands, waiting: [{ block, on }] }: each thing it waits on, once; empty when it can never stand.
function standsOf(b, poolIn) {
  const pool = poolOf(poolIn);
  pool._stands = pool._stands || new Map();
  const mine = pool.get(b.hash) === b;
  if (mine && pool._stands.has(b.hash)) return pool._stands.get(b.hash);
  if (mine) pool._stands.set(b.hash, { stands: false, waiting: [{ block: b.hash, on: 'end' }] }); // asked again from inside itself: not yet
  const r = standsNow(b, pool);
  if (mine) pool._stands.set(b.hash, r);
  return r;
}
function standsNow(b, pool) {
  const never = { stands: false, waiting: [] };
  if (b.type === 'actor' && b.refs.author === undefined) return { stands: soundGenesis(b), waiting: [] };
  const author = b.refs.author;
  if (!isStr(author)) return never;
  const idf = identityFold(author, pool);
  if (idf.signed_by_author[b.hash] !== true) return never;
  const on = new Set();
  // every block it names for its meaning stands
  for (const h of namedFor(b)) { const n = pool.get(h); if (!n || !standsOf(n, pool).stands) on.add('named'); }
  const kg = isKeyGrant(b);
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
    if (!kg && givesPower(b, pool)) { const r = idf.twiceOf(b); if (r.never) return never; if (!r.stands) on.add(r.on); }
  }
  // its own condition (stage 5 says where it is read): until then it waits on it
  if (b.state.condition !== undefined) on.add('condition');
  return { stands: on.size === 0, waiting: ON.filter(o => on.has(o)).map(o => ({ block: b.hash, on: o })) };
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
// ================================================================ valid(block, held) and read(block, held)  (core.md, section 8)
// valid: who said these bytes. block: a whole { hash?, type, state, refs, signature } or a held header { header, header_signature }; held: the blocks held (an array, a Map or a
// Pool; whole blocks and sealed messages). Returns refusals [{ code, detail }] of the first check that finds anything, one per code, in protocol.json's order; `unmet` and
// `unknown_suite` are waits, not refusals. It reads only the block's pieces: no prev, no other link, no schema, no clock.
function uniqueCodes(list) { const seen = new Set(), out = []; for (const f of list) if (!seen.has(f.code)) { seen.add(f.code); out.push({ code: f.code, detail: f.detail || '' }); } return out; }
const heldList = h => (!h ? [] : h instanceof Pool ? h.all() : h instanceof Map ? [...h.values()] : Array.isArray(h) ? h : h.held ? heldList(h.held) : []);
function validStages(block, heldIn) {
  if (!isObj(block)) return { stage: 1, findings: [{ stage: 1, code: 'not_canonical', detail: 'not a block' }], needs: [] };
  const isMsg = block.type === undefined && isObj(block.header) && block.state === undefined;
  const own = isMsg ? headerEntry(block) : block;
  const entries = normEntries(heldList(heldIn));
  const ctx = { idx: buildIdx(entries), memo: new Map(), stack: new Set() };
  return judge(own, ctx, true);
}
function valid(block, held) { return inCodeOrder(validStages(block, held).findings); }
// read: whether this reader can read a block that is valid; every code it finds (names_missing, names_unread, then check 7). `schemas` is the store check 7 reads; with none
// (null) it is the schema store of the blocks held (schemas_from; core.md, section 8).
function readFindings(block, heldIn, schemasIn) {
  if (!isObj(block) || block.type === undefined || !isObj(block.state) || !isObj(block.refs)) throw argError('read is asked of a whole block');
  const held = normEntries(heldList(heldIn)), own = { ...block };
  if (own.hash === undefined) own.hash = idOf(own, held);
  const r = classify([...held.filter(e => e.hash !== own.hash), own], { schemas: Array.isArray(schemasIn) ? normHeld(schemasIn) : undefined });
  if (!r.validE.has(own.hash)) throw argError('read is asked of a block that is not valid');
  return r.codes.get(own.hash) || [];
}

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
  const val = (k, x) => k === 'seq' ? { int: BigInt(x) } : (k === 'withheld' || k === 'skip') ? { bool: x } : RX.hash.test(x) ? { bytes: Buffer.from(x, 'hex') } : { text: x };
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
// GUESS: [S2-14] a block counts toward a pair when the identity fold says its key spoke for its author, a block held as its header (sealed, or not read) as well as a whole one.
// A pair: two blocks of one key that name one prev or state one seq (core.md, invariant 3), both speaking for their author: a block that does not count for its author (a key that does not
// speak, a block a suite move cut) forms no pair, and neither does a block whose key cannot be told. It needs no line: the two blocks, or their two headers, are the whole proof. Blocks
// of two keys are never a pair (the same prev named by the first blocks of two keys a list brings in is two lines).
function forkPairs(blocksIn) {
  const pool = poolOf(blocksIn);
  const groups = new Map();
  const put = (k, h) => { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(h); };
  for (const b of pool.all()) {
    if (!isStr(b.refs.author) || !isStr(b.refs.prev)) continue;
    const idf = identityFold(b.refs.author, pool);
    if (!idf.keyMap.size || idf.signed_by_author[b.hash] !== true) continue;
    const key = signerKeyOf(b, pool);
    if (!key) continue;
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
    for (const x of pool.all()) if (x.refs.author === A.refs.author && (signerKeyOf(x, pool) || x.refs.author) === key && (x.state.seq || 0) >= from) out.add(x.hash);
  }
  pool._eq = out;
  return out;
}
// whether the block does not count for its author: its key does not speak for her there
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
  // the pairs (core.md, invariant 3): blocks of the key that name one prev, and blocks of the key that state one seq (two first blocks of one key state seq 1 or name one prev)
  const groups = new Map();
  for (const b of mine) { for (const k of ['prev|' + b.refs.prev, 'seq|' + b.state.seq]) { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(b.hash); } }
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
// the public header (privacy.md): { author, seq, prev, hash }, with `key` when the block names one, and withheld or skip when it says so. Of a block held by its header, its own.
const header = b => { const h = { author: b.refs.author, seq: b.state.seq, prev: b.refs.prev, hash: b.hash }; const k = keyRefOf(b); if (k !== undefined) h.key = k; if (b.state.withheld === true) h.withheld = true; if (b.state.skip === true) h.skip = true; return h; };

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
function accept(incomingIn, heldIn, takesPairs, schemas) {
  const held = normEntries(heldList(heldIn)), refused = [], whole = [], headers = [];
  const open = new Pool([...held, ...normEntries((incomingIn || []).filter(x => isObj(x) && x.type !== undefined))], true); // bodies, to read the suite of the key that signed each
  for (const x of incomingIn || []) {
    if (!isObj(x)) { refused.push({ hash: '', code: 'shape', detail: 'a message is a block or a sealed block' }); continue; }
    if (x.type === undefined && x.state === undefined && 'header' in x) {
      // a sealed message: { header, header_signature, envelope }; one that carries a version is refused (privacy.md, Sealed messages)
      if (x.version !== undefined) { refused.push({ hash: '', code: 'shape', detail: 'a sealed block carries no version: it is { header, header_signature, envelope }' }); continue; }
      const e = headerEntry(x);
      if (!e) { refused.push({ hash: '', code: 'shape', detail: 'a sealed block is { header, header_signature, envelope }' }); continue; }
      headers.push(e); continue;
    }
    if (x.type === undefined || !isObj(x.state) || !isObj(x.refs)) { refused.push({ hash: isStr(x.hash) ? x.hash : '', code: 'shape', detail: 'a message is a block or a sealed block' }); continue; }
    // a block's id is the one a reader that holds its pieces computes, in the suite of the key that signed it (core.md, section 2): never one it was sent
    const s = isStr(x.refs.author) ? signerFrom(x, open) : null;
    whole.push({ ...x, hash: hashOfBlock(blockOnly(x), (s && s.suite) || suiteFromBlock(blockOnly(x))) });
  }
  // copies of one block (one id once computed so) are taken once, the lowest signature only to name one
  const byId = new Map();
  for (const b of whole.sort((p, q) => cmp(p.hash, q.hash) || cmp(String(p.signature), String(q.signature)))) if (!byId.has(b.hash)) byId.set(b.hash, b);
  const heldBody = new Set(held.filter(e => e.type !== undefined).map(e => e.hash));
  const heldHeader = new Map(held.filter(e => e.type === undefined).map(e => [e.hash, e]));
  const taken = [], newBlocks = [];
  // a held header that does not describe the body arriving under its hash is a lie about that hash: read as never held, and the block takes its place (privacy.md)
  const describes = (h, b) => h.refs.author === b.refs.author && h.state.seq === b.state.seq && h.refs.prev === b.refs.prev && h.keyId === b.refs.key && (h.state.skip === true) === (b.state.skip === true) && (h.state.withheld === true) === (b.state.withheld === true);
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
  return {
    taken: [...new Map(taken.map(e => [e.hash, e])).values()].sort(asc), unjudged: unjudged.sort(asc), refused: refused.sort((a, b) => cmp(a.hash, b.hash) || CODE_ORDER.indexOf(a.code) - CODE_ORDER.indexOf(b.code)),
    unread: unread.sort(asc), equivocations, false_headers: [...lies].filter(h => finalSet.has(h)).sort(),
  };
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
      (isObj(g.state.scope) && g.state.scope.types !== undefined && !typeNames(o).some(n => asList(g.state.scope.types).includes(n)))) return false;
    // profiles/successor.md, When a close counts: the grant stands (signed again: blocks.md, Finality) and the witnesses' key grant stands, both in the close's causal past
    const past = pool.past(o.hash), idf = identityFold(person, pool);
    return idf.twiceOf(g, past).stands && idf.witnessGrantStands(past, g.refs.to);
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
  return pool.all().some(u => ((u.type === 'grant' && ['stopped', 'declined'].includes(u.state.status)) || isDeclineReading(u)) && count(u) && seen(u.hash) && (
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
  // a block dated (its own at) at or after the grant's scope.until acts under no grant (decision D14): its signer's own date says the grant had run out
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
  // a voided close voids only what the successor claimed for himself (decision d1): a block of theirs someone else built on (a counted block of another,
  // neither the person nor the successor, that names it, or whose transfer it accepts) stands when that block's causal past holds a close that counted there
  const backedIn = sub => closesOf(g.refs.author, [], sub, () => true, b => counts(b, pool)).some(h => seenBy(h) && sub.get(h).refs.under === g.hash);
  const reliedOn = () => builtOn(relying, pool, g.refs.author, g.refs.to).some(o => {
    const seen = pool.past(o.hash);
    return backedIn(new Pool(pool.all().filter(b => seen.has(b.hash) || b.hash === relying.hash), true));
  });
  if (relying && g.state.kind === 'successor' && !(relying.type === 'observe' && relying.state.kind === 'close') &&
    !closesOf(g.refs.author, [], pool).some(h => seenBy(h) && pool.get(h).refs.under === g.hash) && !reliedOn()) return false;
  if (g.refs.parent !== undefined) return grantLive(pool.get(g.refs.parent), pool, seen, relying);
  return true;
}
function whyNotUnder(b, poolIn) {
  const pool = poolOf(poolIn);
  const fail = d => [{ code: 'not_live', detail: d }];
  const g = pool.get(b.refs.under);
  if (!g || g.type !== 'grant') return fail('the grant is not held');
  const trigger = false; // 1.8: the successor's trigger is gone (profiles/successor.md)
  if (!trigger && !receives(g, b, pool)) return fail('the signer is not the receiver of the grant');
  if (!grantLive(g, pool, new Set(), b)) return fail('the grant is not live');
  const sc = !trigger && isObj(g.state.scope) ? g.state.scope : {};
  // a block that names a handle (a witness: this handle said yes) is covered only by a grant that names the same one (authority.md, A witness)
  if (!trigger && b.state.handle !== undefined && g.state.handle !== b.state.handle) return fail('the grant does not name the handle');
  const names = typeNames(b);
  if (!trigger && (sc.types === undefined || !names.some(n => asList(sc.types).includes(n)))) return fail('the block\'s type is outside the grant\'s scope');
  // scope.parties: every side the block deals with (its from, to, to_owner and to_holder, and for an answer the sides of the block it answers, or
  // that block's author when it names none) is in parties, its principal aside (authority.md)
  const principal = principalOf(g, pool);
  if (!trigger) { // a grant that states no parties names none: no one beyond its principal
    const ans = isStr(b.refs.answers) ? pool.get(b.refs.answers) : null;
    const sides = ['from', 'to', 'to_owner', 'to_holder'].flatMap(k => asList(b.refs[k]));
    if (ans) { const named = ['from', 'to'].flatMap(k => asList(ans.refs[k])); sides.push(...(named.length ? named : asList(ans.refs.author))); }
    if (sides.some(id => id !== principal && !asList(sc.parties === undefined ? [] : sc.parties).includes(id))) return fail('a side the block deals with is outside the grant\'s parties');
  }
  // a limit the counterparty can see binds him too (authority.md, The limit is the principal's fence): a block whose own value is more than the
  // `limit` or `each` of a public grant (one with no audience) does not bind its principal. A sealed limit, or a grant with an audience, keeps the rule
  // that the fence is the principal's alone. The block is not cut down to the limit: as signed it exceeds the grant, so it does not bind.
  if (!trigger && g.audience === undefined && (sc.limit !== undefined || sc.each !== undefined)) {
    let value = null;
    if (b.type === 'transfer') value = b.state.money !== undefined ? b.state.money : b.state.amount !== undefined ? b.state.amount : null;
    else if (b.type === 'promise' || isMachineAccept(b, pool)) {
      const answered = b.state.status === 'accepted' && isStr(b.refs.answers) ? pool.get(b.refs.answers) : null;
      const t = answered && isObj(answered.state.terms) ? answered.state.terms : isObj(b.state.terms) ? b.state.terms : null;
      if (t) value = termsTotal(t, isObj(b.state.terms) ? b.state.terms.quantity : undefined);
    }
    const fence = {}; if (sc.limit !== undefined) fence.limit = sc.limit; if (sc.each !== undefined) fence.each = sc.each;
    if (isObj(value) && !withinLimit(fence, value, 0)) return fail('the block is worth more than the limit the grant shows, so it does not bind its principal');
  }
  // blocks that can be undone (authority.md): the default is that they cannot. A block that moves things or binds its principal is not live unless the
  // schema it names in refs.schema is trusted (the grantor's own, or one the grantor confirmed) and says undo: ok, or it has a specific accepted
  // ask naming the block, or a grant that names its type and has a limit.
  const typeName = names[names.length - 1];
  const asks = b.type === 'promise' && b.refs.answers === undefined && principal !== null && asList(b.refs.to).includes(principal) && !asList(b.refs.from).includes(principal);
  const moves = b.type === 'transfer' || b.type === 'transform' || isMachineAccept(b, pool) || (b.type === 'promise' && !['declined', 'stopped'].includes(b.state.status) && !asks);
  {
    const S = b.refs.schema && pool.get(b.refs.schema);
    const trusted = S && S.type === 'thing' && S.state.kind === 'schema' && principal !== null &&
      (speakerOf(S, pool) === principal || pool.all().some(c => asList(c.refs.confirms).includes(S.hash) && speakerOf(c, pool) === principal));
    const mark = trusted ? S.state.undo : undefined;
    // irreversible: a trusted schema says never (whatever the block's type), or the block moves things or binds and no trusted schema says ok. A
    // successor acts as the person did once the person has died: the death conditions are its fence (profiles/successor.md)
    if (g.state.kind !== 'successor' && (mark === 'never' || (mark !== 'ok' && moves))) {
      const specificGrant = (sc.limit !== undefined || sc.each !== undefined || sc.limit_commitment !== undefined) && asList(sc.types).includes(typeName); // a cap on each block alone is a limit too
      // a specific ask backs one block (authority.md, An ask names the block): the block names it in for, it names the block, the principal answered it
      // accepted (counted) and no stop or decline of it by the principal is in the block's causal past, and of the blocks under a grant that rely on it
      // this one is the first in causal order (one that crosses another backs neither)
      const byPrincipal = x => principal !== null && speakerOf(x, pool) === principal && counts(x, pool);
      const movesOrBinds = x => x.type === 'transfer' || x.type === 'transform' || isMachineAccept(x, pool) || (x.type === 'promise' && !['declined', 'stopped'].includes(x.state.status) &&
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
        return ask && ask.type === 'promise' && (ask.state.what === typeName || (ask.refs.schema !== undefined && ask.refs.schema === b.refs.schema)) &&
          pool.all().some(a => a.type === 'promise' && a.refs.answers === ask.hash && a.state.status === 'accepted' && byPrincipal(a)) &&
          !pool.all().some(w => ['stopped', 'declined'].includes(w.state.status) && (w.refs.answers === ask.hash || w.refs.updates === ask.hash) && pool.sees(b.hash, w.hash) && byPrincipal(w)) &&
          !pool.all().some(o => o.hash !== b.hash && o.refs.answers !== ask.hash && o.refs.under !== undefined && asList(o.refs.for).includes(ask.hash) && movesOrBinds(o) && rivalOf(o) && !pool.sees(o.hash, b.hash));
      });
      if (!specificGrant && !askedAndAccepted) return fail('a block that moves things or binds is irreversible unless a trusted schema says undo ok; it needs a specific accepted ask or a grant that names it with a limit');
    }
  }
  return [];
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
  const key = (pool.foundingOnly ? 'F|' : '') + circleId + '|' + (limit ? [...limit].sort().join(',') : '*') + '|' + (exclude ? [...exclude].sort().join(',') : '');
  if (pool.folds.has(key)) return pool.folds.get(key);
  const out = circleFoldNow(circleId, pool, limit, exclude);
  pool.folds.set(key, out);
  return out;
}
// The circle's rules as they stand (circles.md, Versions): the founding block with each rule a carried version moves set to that version's value; within
// `limit` (a block's causal past), as they stand in that past. A founding block with no `change` line has none to move.
function circleRoot(circleId, pool, limit) {
  const C = pool.get(circleId);
  if (!C || pool.foundingOnly || !isObj(C.state) || !Array.isArray(C.state.change)) return C;
  const key = 'R|' + circleId + '|' + (limit ? [...limit].sort().join(',') : '*');
  if (pool.folds.has(key)) return pool.folds.get(key);
  const sub = limit ? new Pool([...limit].map(h => pool.get(h)).filter(Boolean)) : pool;
  const moved = limit && !limit.has(circleId) ? [] : versionsOf(circleId, sub).current;
  let out = C;
  if (moved.length) { out = { ...C, state: { ...C.state } }; for (const [rule, value] of moved) { if (value === undefined) delete out.state[rule]; else out.state[rule] = value; } }
  pool.folds.set(key, out);
  return out;
}
function circleFoldNow(circleId, pool, limit, exclude) {
  const inScope = h => (!limit || limit.has(h)) && !(exclude && exclude.has(h));
  const C = circleRoot(circleId, pool, limit);
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
      if ((b.type !== 'grant' && !isDeclineReading(b)) || grants.includes(b) || !inScope(b.hash) || !counts(b, pool)) continue;
      if (b.refs.answers === circleId || b.refs.updates === circleId || grants.some(g => b.refs.answers === g.hash || b.refs.updates === g.hash)) { grants.push(b); grew = true; }
    }
  }
  const founderRoles = roles.length ? [roles[0].name] : [];
  const isFounding = g => g.hash === circleId;
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
  // the blocks a fold sets aside: every block by a member whose grant ended that would use the circle's authority (signed as it, a confirm, a block
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
  const C = circleRoot(circleId, pool, pool.before(block.hash)), m = memberAt(circleId, block, pool);
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
// circle_versions (circles.md, Versions; folds.md)
function circleVersions(circleId, blocks) {
  return versionsOf(circleId, poolOf(blocks)).out;
}
// the versions are judged by the founding block's own rules (who is a member, who may write a version); every other fold reads the rules as they stand
function versionsOf(circleId, pool) {
  const was = pool.foundingOnly;
  pool.foundingOnly = true;
  try { return versionsRead(circleId, pool); } finally { pool.foundingOnly = was; }
}
function versionsRead(circleId, pool) {
  const none = { out: null, current: [] };
  const C = pool.get(circleId);
  if (!C || C.type !== 'actor' || C.state.kind !== 'circle' || C.refs.updates !== undefined) return none;
  const members = Object.keys(circleWhole(circleId, pool, null).members).sort();
  const NOT = ['kind', 'seq', 'at', 'audience', 'withheld', 'skip'];
  const rulesOf = b => Object.fromEntries(Object.entries(b.state).filter(([k]) => !NOT.includes(k)));
  const parents = new Map();
  const cands = pool.all().filter(b => b.type === 'actor' && b.state.kind === 'circle' && b.refs.updates !== undefined && counts(b, pool)).sort((a, b) => (a.hash < b.hash ? -1 : 1));
  for (let grew = true; grew;) {
    grew = false;
    for (const b of cands) {
      const p = b.refs.updates;
      if (parents.has(b.hash) || !(p === circleId || parents.has(p))) continue;
      if (memberAt(circleId, b, pool)) { parents.set(b.hash, p); grew = true; }
    }
  }
  const descends = (h, v) => { let cur = h; for (;;) { if (cur === v) return true; if (!parents.has(cur)) return false; cur = parents.get(cur); } };
  const signed = new Map(members.map(m => [m, new Set()]));
  for (const b of pool.all()) {
    const who = b.refs.author;
    if (!signed.has(who)) continue;
    if (parents.has(b.hash)) signed.get(who).add(b.hash);
    else if (parents.has(b.refs.answers) && b.state.status === 'accepted' && counts(b, pool) && memberAt(circleId, b, pool)) signed.get(who).add(b.refs.answers);
  }
  const heads = new Map(members.map(m => {
    const s = [...signed.get(m)];
    const h = s.filter(v => !s.some(w => w !== v && descends(w, v)));
    return [m, h.length ? h : [circleId]];
  }));
  const count = v => members.filter(m => heads.get(m).some(h => descends(h, v))).length;
  const changed = v => {
    const a = rulesOf(pool.get(v)), o = rulesOf(pool.get(parents.get(v)));
    return [...new Set([...Object.keys(a), ...Object.keys(o)])].filter(k => JSON.stringify(a[k]) !== JSON.stringify(o[k])).sort();
  };
  const needed = rule => {
    const lines = Array.isArray(C.state.change) ? C.state.change.filter(x => x && x.rule === rule) : [];
    if (lines.length !== 1) return null;
    const n = lines[0].needed;
    if (n === 'all') return members.length;
    const sh = shareOfMembers(n);
    if (sh) return Math.max(1, Math.ceil(members.length * sh[0] / sh[1]));
    return Number.isInteger(n) && n >= 1 ? n : null;
  };
  const ids = [...parents.keys(), circleId].sort();
  const lowest = m => [...heads.get(m)].sort()[0];
  const ruleNames = new Set();
  const versions = ids.map(v => {
    const ch = v === circleId ? [] : changed(v);
    ch.forEach(r => ruleNames.add(r));
    return { version: v, updates: parents.has(v) ? parents.get(v) : null, author: pool.get(v).refs.author, changed: ch, count: count(v) };
  });
  const rules = {}, current = [];
  for (const r of [...ruleNames].sort()) {
    const n = needed(r);
    const chg = v => v !== circleId && changed(v).includes(r);
    const carried = v => n !== null && chg(v) && count(v) >= n;
    // the version now carrying the rule: the one carried version no other carried version is built on; with rivals, none
    const cv = ids.filter(carried), tip = cv.filter(v => !cv.some(w => w !== v && descends(w, v)));
    if (tip.length === 1 && r !== 'change') current.push([r, pool.get(tip[0]).state[r]]);
    const by = {};
    for (const m of members) {
      const h = lowest(m);
      const S = ids.filter(v => v !== h && descends(v, h) && carried(v));
      const tips = S.filter(v => !S.some(w => w !== v && descends(w, v)));
      by[m] = tips.length === 1 ? tips[0] : h;
    }
    rules[r] = { needed: n, versions: ids.filter(chg).map(v => ({ version: v, count: count(v), carried: carried(v) })), members: by };
  }
  return { out: { circle: circleId, versions, members: Object.fromEntries(members.map(m => [m, lowest(m)])), rules }, current };
}
// circle_key (profiles/rekeys.md)
function circleKey(circleId, blocks) {
  const pool = poolOf(blocks);
  const C = circleRoot(circleId, pool, null);
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
  return idf.keys.some(k => answerSignedBy(an, k)) ? an.at : null;
}
function promiseStage(firstIn, poolIn, opts) {
  // the first promise is read with the blocks held; one that rests on blocks not held is not read yet: no stage (folds.md)
  const pool = new Pool(typeof firstIn === 'string' ? poolOf(poolIn).all() : [firstIn, ...poolOf(poolIn).all()]);
  const P = pool.get(typeof firstIn === 'string' ? firstIn : firstIn.hash);
  if (!P) return null;
  GS = Math.max(0, ...pool.all().map(blockScale));
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
    const t = os && os.takers.find(x => x.allocation === P.hash);
    return t ? { O, R, t } : null;
  })();
  const Q = alloc ? alloc.O : P; // the root: sides, terms, what
  const out = { stage: null, stop: null, from: null, by: null, offer: Q.hash, accept: null, sides: { from: Q.refs.from === undefined ? null : Q.refs.from, to: Q.refs.to === undefined ? null : Q.refs.to }, quantity: null, takers: [], forks: [], lines: [], total: null, paid: null, stopped: [], passed: [], answerable: { from: null, to: null }, owing: { from: [], to: [] }, disputed: [], due: null, paid_at: null, occurrences: [], referee_ties: [], uncovered: null, over_allocated: false, owed: null, owed_on: [], received_at: [], moved: [], price_fixed: null };
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
  // parts passed on (promises.md, Passing a part): a pass is an observe of kind pass, for the deal, to one receiver, signed by whoever answers for the
  // side's part (the side itself, or the receiver of an earlier accepted pass); it counts once the receiver's own observe answers it accepted
  const passList = [];
  {
    const holder = {};
    const seenD = D.slice().sort((a, b) => (pool.past(a.hash).size - pool.past(b.hash).size) || (a.hash < b.hash ? -1 : 1));
    for (const p of seenD) {
      if (p.type !== 'observe' || p.state.kind !== 'pass' || !asList(p.refs.for).includes(P.hash)) continue;
      const by = who(p), to = p.refs.to;
      if (!isStr(by) || !isStr(to) || to === by) continue;
      const side = ['from', 'to'].find(k => (holder[k] !== undefined ? holder[k] === by : sideOfB(p) === k));
      if (!side) continue;
      if (seenD.some(a => a.type === 'observe' && a.state.status === 'accepted' && a.refs.answers === p.hash && who(a) === to)) {
        const other = side === 'from' ? 'to' : 'from'
        // the other side's own accept of the pass frees the passer (a third signature)
        const f = seenD.find(a => a.type === 'observe' && a.state.status === 'accepted' && a.refs.answers === p.hash && (holder[other] !== undefined ? who(a) === holder[other] : sideOfB(a) === other))
        holder[side] = to; passList.push({ pass: p.hash, side, by, to, freed_by: f ? who(f) : null })
      }
    }
  }
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
      const principalOk = !quoteOffer(o) || (principal !== null && D.some(b => isAcc(b) && b.refs.answers === o.hash && who(b) === principal && !quoteOffer(b)));
      // the offerer voids an accept by answering it declined only on an offer that carried expires (an accept that reached them late): an offer with
      // no expires is firm (promises.md, Who may bind)
      const expires = termsOf(o).expires !== undefined;
      for (const a of D) {
        if (!isAcc(a) || a.refs.answers !== o.hash || !sideOfB(a) || sideOfB(a) === oSide || quoteOffer(a) || !fits(a, o) || !conditionBinds(o)) continue;
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
    // of crossing accepts on different terms, the one the other side's block names binds (decisions D11, E2: a lie never frees the liar, and the other
    // side's own signed block says which word it took up): a counted block of the other side's in the deal, but a decline of it, that names it among its
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
  const owedTotal = fixing ? null : totalBig, owedCur = total ? totalKind : null;
  // a price in goods is handed over by an amount of that unit, as a price in money is by money (promises.md, Owed)
  const owedGoods = isObj(owedCur) && owedCur.goods !== undefined;
  const owedSide = k => { const r = Q.refs[k]; if (self || (r !== undefined && r !== '' && isThing(r))) return null; const w = sideAt(k, accept); return isStr(w) && w !== '' ? w : null; };
  const owedCands = (terms.personal === true || self) ? [] : pool.all().filter(t => t.type === 'transfer' && asList(t.refs.what).includes(P.hash) && t.state.status === undefined && t.refs.to_owner !== undefined && (t.state.amount === undefined || owedGoods) && counts(t, pool) && pool.sees(t.hash, accept.hash));
  const owedActive = owedCands.length > 0;
  const portion = (o, w) => { const e = o.price.find(x => x[0] === w); return e ? e[1] : 0n; };
  const owedInitial = () => { const f = owedSide('from'); return { noun: owedSide('to'), price: f !== null && owedTotal !== null && owedTotal > 0n ? [[f, owedTotal]] : [], moves: [], applied: [], forked: [] }; };
  const owedMemo = new Map();
  const owedAccepted = (t, vis) => pool.all().some(a => a.type === 'transfer' && a.state.status === 'accepted' && vis(a.hash) && counts(a, pool) && asList(a.refs.answers).includes(t.hash) && asList(t.refs.to_owner).includes(who(a)) && answerStands(t, a, pool));
  const owedMoney = t => { if (owedGoods) { const a = t.state.amount; return isObj(a) && a.unit === owedCur.goods ? (scaledBig(a.value) || 0n) : 0n; } const m = t.state.money; if (!isObj(m) || curKey(m.currency) !== curKey(owedCur)) return 0n; return BigInt(m.minor); };
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
      const holds = t.state.money !== undefined || t.state.amount !== undefined ? portion(before, signer) > 0n : (before.noun === signer || portion(before, signer) > 0n);
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
      if (t.state.money !== undefined || t.state.amount !== undefined) { const m = owedMoney(t), have = portion(before, signer); amount = m < have ? m : have; }
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
  // the parts passed on, none when the terms say personal; a receiver's word counts as the side's whose part it answers for
  const passes = terms.personal === true ? [] : passList;
  const partSide = b => sideOfB(b) || ((p => (p ? p.side : null))(passes.find(x => x.to === who(b))));
  const settling = D.filter(b => !defeated(b.hash) && b.refs.answers === undefined && b.hash !== P.hash && b.type !== 'promise' && asList(b.refs.for).includes(P.hash) && partSide(b));
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
      const receiver = sideAt(partSide(b) === 'from' ? 'to' : 'from', b);
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
    if (o.applied.length || o.forked.length) out.owed = { to: o.noun === undefined ? null : o.noun, from: o.price.map(([w, d]) => (owedGoods ? { owner: w, amount: kindOut(d, ownCur) } : { owner: w, money: { minor: minorOut(d), currency: ownCur === undefined ? null : ownCur } })), forked: [...o.forked].sort() };
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
    // an occurrence kept with no price: the doer's own done made for the deal, naming it; the doer is the from side, or whoever it passed the part to
    const dones = pool.all().filter(o => o.type === 'observe' && o.state.kind === 'done' && isStr(o.state.occurrence) && asList(o.refs.for).includes(P.hash) && partSide(o) === 'from' && counts(o, pool) && !defeated(o.hash));
    const names = [...new Set([...pays.flatMap(occOf), ...events.map(o => o.hash), ...dones.map(o => o.state.occurrence)])].sort();
    for (const name of names) {
      const ev = events.find(o => o.hash === name);
      const rcv = ev && kclock ? receivedAt(ev.hash, kclock, pool) : null;
      const due = ev ? (isStr(rcv) ? (wait ? addDur(rcv, wait) : rcv) : null) : (timeProblem(name) === null && !RX.hash.test(name) ? name : null);
      const mine = pays.filter(b => occOf(b).includes(name));
      const sum = mine.reduce((t, b) => t + sumFor(b, name), 0n);
      const paid = !mine.length || (total === null && (ownCur === undefined || ownCur === null)) ? null : kindOut(sum, ownCur);
      const covered = totalBig !== null && sum >= totalBig && sum > 0n;
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
  for (const b of D) {
    if (!(b.type === 'promise' && b.state.status === 'stopped' && isObj(b.state.stop) && Array.isArray(b.state.stop.occurrences) && sideOfB(b))) continue;
    // a pause ends early by its own signer's updates of it, status resumed (promises.md, Answers): the times named at or after its at stand again
    const back = D.filter(r => r.type === 'promise' && r.state.status === 'resumed' && r.refs.updates === b.hash && r.refs.answers === undefined).map(r => Date.parse(r.state.at)).filter(t => !Number.isNaN(t));
    b.state.stop.occurrences.forEach(o => { const t = timeProblem(o) === null ? Date.parse(o) : NaN; if (!(back.some(r => r <= t))) occ.add(o); });
  }
  out.stopped = [...occ].sort();
  out.passed = passes.map(x => ({ ...x }));
  // the sides the binding terms say may show the deal (privacy.md, Showing a deal); a deal that says nothing has no `show`
  if (Array.isArray(terms.show)) out.show = [...new Set(terms.show.filter(x => x === 'from' || x === 'to'))].sort();
  out.answerable = { from: ((l) => (l ? l.to : (receiverAt('from', accept) ?? null)))(passes.filter(x => x.side === 'from').pop()), to: ((l) => (l ? l.to : (receiverAt('to', accept) ?? null)))(passes.filter(x => x.side === 'to').pop()) };
  const owingOf = side => [...new Set([...passes.filter(x => x.side === side && x.freed_by === null).map(x => x.by), out.answerable[side]].filter(x => isStr(x)))].sort()
  out.owing = { from: owingOf('from'), to: owingOf('to') }
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
  if (g && g.type === 'grant' && grantLive(g, pool, new Set(), b) && receives(g, b, pool) && ((b.type === 'promise' && b.state.status === undefined) || !whyNotUnder(b, pool).length)) return principalOfChain(g, pool);
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
function answerStands(t, a, pool) {
  const giver = speakerOf(t, pool);
  return !pool.all().some(w => (w.type === 'transfer' || isDeclineReading(w)) && counts(w, pool) && giver !== null && speakerOf(w, pool) === giver &&
    ((w.type === 'transfer' && w.state.status === 'stopped' && w.state.stop === 'before' && w.refs.updates === t.hash && pool.sees(a.hash, w.hash)) ||
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
  return pool.all().some(a => ((a.type === 'transfer' && (a.state.status === 'stopped' || a.state.status === 'declined')) || isDeclineReading(a)) && seen(a.hash) && a.refs.answers === t.hash && counts(a, pool) &&
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
      closesOf(person, [], pool, h => past.has(h)).some(h => pool.get(h).refs.under === g.hash); // her transfer with a counted close of her under the grant in its causal past yields (folds.md, What each fold returns)
  });
}
function whereNow(thingIn, blocks, seen) {
  const pool = withThing(thingIn, blocks);
  const thing = typeof thingIn === 'string' ? pool.get(thingIn) : pool.get(thingIn.hash) || thingIn;
  seen = seen || new Set();
  if (seen.has(thing.hash) || seen.size >= READ_DEPTH) return [];
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
  if (!thing) return { standing: [], nothing: [] }; // a block no node would take is no thing
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
// what use of a place the record shows: counted transforms that make nothing from anything, naming the place in refs.subject, with state.use what was done;
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
    if (isStr(block.refs.author) && backedIn(n, block.refs.author, pool).backed) shown.push({ block: n.hash, by: n.refs.author, reason: isStr(n.state.reason) ? n.state.reason : null, threat: isStr(n.state.threat) ? n.state.threat : null, at: isStr(n.state.at) ? n.state.at : null });
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
  // a fold reads only what is valid and read (folds.md): a head not held as a valid block is no pot
  const head = pool.get(typeof headIn === 'string' ? headIn : headIn.hash);
  if (!head || head.type !== 'promise' || head.refs.answers !== undefined) return null;
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
  // an autonomous system: one an operator answers for too, or a block under a grant
  const isAgent = autonomous(author, pool, true) || block.refs.under !== undefined;
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
  return backedIn(block, person, readWith(blocks, block));
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
  if (!counts(b, pool)) return no('its signer\'s key does not speak for its author here', chain);
  let root;
  if (b.refs.as !== undefined) {
    if (!mayActAsIn(b, b.refs.as, pool)) return no('it is signed as a circle by one who holds no sign there', chain);
    root = b.refs.as;
  } else if (b.refs.author === person) return { backed: true, why: null, chain };
  else if (b.refs.under !== undefined) {
    const wrong = whyNotUnder(b, pool);
    if (wrong.length) return no('a grant does not back it: ' + wrong.map(w => w.detail).join('; '), chain);
    let g = pool.get(b.refs.under);
    for (;;) { chain.push(g.hash); const up = g.refs.parent === undefined ? null : pool.get(g.refs.parent); if (!up) break; g = up; }
    root = principalOf(g, pool); // g is grantTop(pool.get(b.refs.under), pool), walked here for the chain
    if (root === null) return no('the grant at the top of its chain is signed as a circle by one who may not sign for it', chain);
  } else return no('it is signed by someone else and names no grant', chain);
  if (root === person) return { backed: true, why: null, chain };
  const C = pool.get(root);
  if (C && C.type === 'actor' && C.state.kind === 'circle' && pool.before(b.hash).has(root)) {
    const m = circleWhole(root, pool, pool.before(b.hash)).members[person];
    if (m && powersOf(C, rolesAt(m, b, pool)).has('sign')) return { backed: true, why: null, chain };
  }
  return no('its chain roots in someone else', chain);
}
// gives(block, person, blocks): what of the person's would become whose if the block stands (promises.md, What becomes whose). { gives: [line] }.
function gives(block, person, blocks) {
  if (!isObj(block)) throw argError('argument 0 is a block');
  if (!isStr(person)) throw argError('person is an id (text)');
  return givesIn(block, person, readWith(blocks, block), blocks);
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
// the lines of a block read as if the person backed it, with no judgement of who signed it (owedBack asks them of a transfer `backed` refused)
function linesIn(block, person, pool) {
  const line = (of, to, back, parts) => ({ of, ...parts, to: to === undefined ? null : to, back: back === undefined ? null : back });
  // a thing is hers as of the block's own place in time (its causal past), never by today's owner; a thing not held is not hers, and is listed in `unplaced` (no line, but never "nothing"); a held kind is a description
  // with no owner, and promising goods of a kind is her own word
  const unplaced = [];
  const hers = w => { const t = pool.get(w); if (!t) { unplaced.push(w); return false; } if (!t.refs || t.refs.of === undefined) return true; return ownershipFold(t, pool, block.signature === undefined ? undefined : pool.past(block.hash)).owner === person; };
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
        out.push(line(until !== undefined ? 'use' : 'goods', to, until, { what: w, ...amount }));
      }
    }
    if (to === person) {
      const total = termsTotal(terms, chosen);
      if (total && total.minor !== undefined) out.push(line('money', from, null, { minor: total.minor, currency: total.currency }));
      else if (total && total.unit !== undefined) out.push(line('goods', from, null, { amount: total }));
    }
  } else if (block.type === 'transfer') {
    if (block.state && block.state.status !== undefined) return { gives: [] };
    const owner = block.refs.to_owner, holder = block.refs.to_holder;
    let until;
    for (const d of asList(block.refs.for)) { const x = pool.get(d); if (x && x.state && isObj(x.state.terms) && isStr(x.state.terms.until)) { until = x.state.terms.until; break; } }
    const money = block.state.money;
    if (isObj(money) && money.minor !== undefined) out.push(line('money', owner, null, { minor: money.minor, currency: money.currency }));
    for (const w of asList(block.refs.what)) {
      if (owner !== undefined && hers(w)) out.push(line('goods', owner, null, { what: w }));
      else if (owner === undefined && holder !== undefined) out.push(line('use', holder, until, { what: w }));
    }
  }
  const unique = [...new Set(unplaced)].sort();
  return { gives: out.filter(l => l.to !== person), ...(unique.length ? { unplaced: unique } : {}) };
}
// owedBack(person, blocks): money moved in the person's name that they do not back (promises.md, What is owed back). { owed: [{ block, minor, currency, to, why }] }:
// each transfer of `blocks` whose money is the person's by `gives` and that `backed` says they do not back. A transfer no node would hold is not backed either.
function owedBack(person, blocks) {
  if (!isStr(person)) throw argError('person is an id (text)');
  const pool = poolOf(blocks), seen = new Set(), owed = [];
  for (const b of asList(blocks)) {
    if (b.type !== 'transfer' || seen.has(b.hash)) continue;
    seen.add(b.hash);
    const read = pool.get(b.hash) ? pool : readWith(blocks, b);
    const verdict = backedIn(b, person, read);
    if (verdict.backed) continue;
    if (claimedBy(b, read) !== person) continue;
    for (const l of linesIn(b, person, read).gives) if (l.of === 'money') owed.push({ block: b.hash, minor: l.minor, currency: l.currency, to: l.to, why: verdict.why });
  }
  return { owed };
}

// ---- the market's shapes (promises.md: Finding, A signed check, Clearing, Rulings) ----
// a measure of money or goods as an exact fraction in its kind; null for anything else
const measureOf = m => {
  if (!isObj(m)) return null;
  if (Number.isInteger(m.minor) && isStr(m.currency)) return { kind: 'c:' + m.currency, v: { n: BigInt(m.minor), d: 1n } };
  if (isStr(m.value) && isStr(m.unit) && dec(m.value)) return { kind: 'g:' + m.unit, v: dec(m.value) };
  return null;
};
const fracText = f => { let n = f.n, d = f.d, k = 0; while (d > 1n) { d /= 10n; k++; } const neg = n < 0n; if (neg) n = -n; let t = n.toString().padStart(k + 1, '0'); let w = t.slice(0, t.length - k), fr = t.slice(t.length - k).replace(/0+$/, ''); return (neg ? '-' : '') + w + (fr ? '.' + fr : ''); };
const measureOut = (kind, v) => kind.startsWith('c:') ? { minor: Number(v.n / v.d), currency: kind.slice(2) } : { value: fracText(v), unit: kind.slice(2) };
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
  const debtor = st.answerable && isStr(st.answerable.to) ? st.answerable.to : (st.sides && isStr(st.sides.to) ? st.sides.to : null);
  const owners = st.owed && Array.isArray(st.owed.from) ? st.owed.from.map(l => l.owner).filter(isStr) : [];
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
    const shown = { deal, ok: false, why: null, owed: null, reduce: null, left: null };
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
    shown.owed = measureOut(total.kind, owed);
    const red = measureOf(line.reduce);
    if (!red || fcmp(red.v, { n: 0n, d: 1n }) <= 0) { no('`reduce` is an amount of money or goods above nothing'); continue; }
    shown.reduce = measureOut(red.kind, red.v);
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
    if (fcmp(applied, owed) > 0) { no('it reduces the deal by more than is still owed'); continue; }
    shown.left = measureOut(total.kind, { n: owed.n * applied.d - applied.n * owed.d, d: owed.d * applied.d });
    shown.ok = true;
    out.push(shown);
  }
  const people = sortedIds(who), signed = people.filter(p => signedBy(clearing, p, pool)), missing = people.filter(p => !signed.includes(p));
  const first = out.find(l => !l.ok);
  const why = first ? first.deal + ': ' + first.why : missing.length ? missing.length + ' of those in it have not signed' : null;
  return { binds: why === null, why, who: people, missing, lines: out };
}
// ruledFor(c, pool, now): the judge's head ruling on the deal, and its award line to the person (promises.md, Rulings); { ruling, award } or { why }; null for another shape
function ruledFor(c, pool, now) {
  if (!isObj(c) || !('ruled' in c)) return null;
  if (![c.ruled, c.by, c.awards].every(x => isStr(x) && RX.id.test(x))) return { why: 'a condition `ruled` names the deal, the judge and the person it awards to' };
  const mine = pool.all().filter(o => o.type === 'observe' && o.state.kind === 'ruling' && o.refs.subject === c.ruled && (!isStr(now) || (isStr(o.state.at) && o.state.at <= now)) && counts(o, pool) && backedIn(o, c.by, pool).backed);
  if (!mine.length) return { why: 'the judge has made no ruling on the deal' };
  const heads = mine.filter(w => !mine.some(o => o !== w && pool.sees(o.hash, w.hash)));
  if (heads.length !== 1) return { why: 'two rulings that do not see each other' };
  const award = asList(heads[0].state.awards).find(l => isObj(l) && l.to === c.awards);
  return award ? { ruling: heads[0].hash, award } : { why: 'the ruling awards nothing to that person' };
}
function rulingReleases(stake, blocks, now) {
  if (!isObj(stake)) throw argError('argument 0 is a block');
  const pool = readWith(blocks, stake), no = why => ({ releases: false, to: null, money: null, ruling: null, why });
  // a stake releases only if it binds. A promise binds once its stage says so (the accept consents to the terms that name the judge: both sides chose her);
  // a transfer is its giver's own signed move, so it counts if its key speaks for her and every deal it is `for` binds
  const stageBinds = h => { const f = pool.get(h), st = f ? promiseStage(f, pool) : null; return !!st && (['accepted', 'underway', 'done', 'reversed', 'breached'].includes(st.stage) || (st.stage === 'stopped' && st.stop === 'onward')); };
  const cond = stake.type === 'promise' ? (isObj(stake.state.terms) ? stake.state.terms.condition : undefined) : stake.type === 'transfer' ? stake.state.condition : undefined;
  // a transfer rests on every deal it is `for`, and on the deal its condition `ruled` names when that is a first promise held (a ruling may be about a claim or a thing)
  const ruledDeal = isObj(cond) && isStr(cond.ruled) && pool.get(cond.ruled) && pool.get(cond.ruled).type === 'promise' && pool.get(cond.ruled).refs.answers === undefined ? [cond.ruled] : [];
  const binding = stake.type === 'promise' ? stageBinds(stake.hash) : counts(stake, pool) && [...asList(stake.refs.for), ...ruledDeal].every(h => !!pool.get(h) && stageBinds(h));
  const r = ruledFor(cond, pool, now);
  if (r === null) return no('the stake\'s condition names no ruling');
  if (r.why) return no(r.why);
  if (!binding) return { releases: false, to: r.award.to, money: null, ruling: r.ruling, why: 'the stake does not bind: it is not signed by both sides who name this judge, or the deal it serves is not accepted' };
  let staked = null;
  if (stake.type === 'promise') { const t = isObj(stake.state.terms) ? termsTotal(stake.state.terms) : null; staked = t ? measureOf(t) : null; } else staked = measureOf(stake.state.money);
  const awarded = measureOf(r.award.money !== undefined ? r.award.money : r.award.amount);
  let money = null;
  if (staked) {
    if (awarded && awarded.kind !== staked.kind) return no('the award is in another kind than the stake');
    money = measureOut(staked.kind, awarded && fcmp(awarded.v, staked.v) < 0 ? awarded.v : staked.v);
  }
  return { releases: true, to: r.award.to, money, ruling: r.ruling, why: null };
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
    const want = measureOf(l.money !== undefined ? l.money : l.amount);
    if (want === null) return false;
    let tot = { n: 0n, d: 1n };
    for (const t of pool.all()) {
      if (t.type !== 'transfer' || t.state.status !== undefined || !asList(t.refs.for).includes(ruling.hash) || t.refs.to !== l.to || !counts(t, pool)) continue;
      const m = measureOf(t.state.money !== undefined ? t.state.money : t.state.amount);
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
// owed lists, per payer and kind, the fee paid (money of counted transfers from the payer to her, for the offer, refs.subject the deal) times fee_back rounded to
// the nearest minor unit, halves up; returned is what she has since sent that payer the same way; left the rest, never below zero.
function feeBack(offer, deal, blocks) {
  if (!isObj(offer) || !isObj(deal)) throw argError('arguments 0 and 1 are blocks');
  const pool = new Pool([...poolOf(blocks).all().filter(x => x.hash !== offer.hash && x.hash !== deal.hash), offer, deal]);
  const out = (settled, releases, owed, why) => ({ settled, releases, owed, why });
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
  const sums = new Map(); // payer + kind -> { payer, currency, paid, back }
  for (const t of pool.all()) {
    if (t.type !== 'transfer' || t.state.status !== undefined || !asList(t.refs.for).includes(offer.hash) || t.refs.subject !== deal.hash || !counts(t, pool)) continue;
    const m = t.state.money;
    if (!(isObj(m) && m.minor !== undefined && m.currency !== undefined)) continue;
    const sp = speakerOf(t, pool);
    let payer, side;
    if (sp === judge && isStr(t.refs.to) && backedIn(t, judge, pool).backed) { payer = t.refs.to; side = 'back'; } else if (t.refs.to === judge && isStr(sp)) { payer = sp; side = 'paid'; } else continue;
    const key = payer + '\0' + curKey(m.currency);
    if (!sums.has(key)) sums.set(key, { payer, currency: m.currency, paid: 0n, back: 0n, paying: false });
    sums.get(key)[side] += BigInt(m.minor);
    if (side === 'paid') sums.get(key).paying = true;
  }
  const lines = [...sums.values()].filter(x => x.paying).sort((x, y) => (x.payer < y.payer ? -1 : x.payer > y.payer ? 1 : curKey(x.currency) < curKey(y.currency) ? -1 : curKey(x.currency) > curKey(y.currency) ? 1 : 0));
  const owed = lines.map(x => {
    const top = 2n * x.paid * fb.n + fb.d, bot = 2n * fb.d, q = top / bot;
    const money = top < 0n && q * bot !== top ? q - 1n : q;
    const left = money > x.back ? money - x.back : 0n;
    return { to: x.payer, money: { minor: minorOut(money), currency: x.currency }, returned: { minor: minorOut(x.back), currency: x.currency }, left: { minor: minorOut(left), currency: x.currency } };
  });
  return out(true, [a, b].sort(), owed, null);
}
// accountOf(who, blocks): where a person says money to them goes (promises.md, Where to pay me). The words counted are the `observe` blocks of kind `account` that `who`
// signed, that speak for no one else and that a node would take; the head is the one no other of those has in its causal past. null for none, for two heads that
// do not see each other, and for a head with no destination (it ends the account).
function accountOf(who, blocks) {
  if (!isStr(who)) throw argError('who is an id (text)');
  const pool = poolOf(blocks);
  const words = pool.all().filter(b => b.type === 'observe' && b.state.kind === 'account' && b.state.status === undefined && b.refs.author === who && counts(b, pool) && speakerOf(b, pool) === who);
  const heads = words.filter(w => !words.some(o => o !== w && pool.sees(o.hash, w.hash)));
  if (heads.length !== 1) return null;
  const d = heads[0].state.destination;
  return isStr(d) && d.trim() !== '' ? { who, destination: d, hash: heads[0].hash, at: isStr(heads[0].state.at) ? heads[0].state.at : null } : null;
}
// scopeReading(scope): the one reading of a grant's state.scope (authority.md), every default the spec states and nothing else filled in. A missing scope is
// empty. A field that is there and cannot be read (what the write check refuses in a scope, or a name that is no scope field) is junk and reads as null or
// [] beside it, so a caller finds that the grant is to be held to no word. junk is sorted as canonical JSON sorts keys.
function scopeReading(scope) {
  const none = { types: [], parties: [], limit: null, each: null, every: null, until: null, notice: null, sealed: false, condition: null, junk: [] };
  if (scope === undefined || scope === null) return none;
  if (!isObj(scope)) return { ...none, junk: ['scope'] };
  const sealed = 'limit_commitment' in scope;
  const unreadable = {
    types: v => !(Array.isArray(v) && v.every(isStr)),
    parties: v => !(Array.isArray(v) && v.every(x => isStr(x) && RX.id.test(x))) || v.some(x => idProblem(x) === 'unknown_suite'),
    // a limit, and a cap on each block, are money or an amount, zero or more; a sealed scope keeps both inside its commitment
    limit: v => sealed || moneyOrAmountProblem(v),
    each: v => sealed || moneyOrAmountProblem(v),
    limit_commitment: v => !isStr(v) || !RX.id.test(v) || idProblem(v) !== null,
    every: v => durationProblem(v) !== null,
    notice: v => durationProblem(v) !== null,
    until: v => timeProblem(v) !== null,
    condition: () => false,
  };
  const junk = Object.keys(scope).filter(k => !Object.prototype.hasOwnProperty.call(unreadable, k) || unreadable[k](scope[k])).sort();
  const read = k => (k in scope && !junk.includes(k) ? scope[k] : null);
  return { types: read('types') || [], parties: read('parties') || [], limit: read('limit'), each: read('each'), every: read('every'), until: read('until'), notice: read('notice'),
    sealed, condition: 'condition' in scope ? scope.condition : null, junk };
}
const moneyOrAmountProblem = v => { const unit = isObj(v) && 'unit' in v; return (unit ? amountProblem(v) : moneyProblem(v)) !== null || (unit ? decCmp(v.value, '0') < 0 : v.minor < 0); };
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
// A key signs four shapes, told apart by their top-level keys (core.md, section 2): a request has `signer` and `node`, an answer has `node` and neither `signer` nor `hash`; a header (`hash`)
// or a genesis (`type`) is no message. A verifier checks the key set before the signature.
const messageShape = m => (!isObj(m) ? null : 'signer' in m && 'node' in m ? 'request' : 'node' in m && !('signer' in m) && !('hash' in m) && !('type' in m) ? 'answer' : null);
const verifyMessage = (m, pubHex) => messageShape(m) !== null && verifyBytes(Buffer.from(jcs(withoutSignature(m)), 'utf8'), m.signature, pubHex);
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
  for (const k of P.messages.discovery) if (k !== 'log' && !(k in d)) out.push('missing ' + k); // `log` is there when it keeps one (nodes.md, Discovery)
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
  // the public header describes the body exactly (privacy.md): its hash, author, key, seq, prev and flags
  const h = msg.header;
  if (isObj(h) && (h.hash !== hash || h.author !== b.refs.author || h.seq !== b.state.seq || h.prev !== b.refs.prev || h.key !== b.refs.key || ['skip', 'withheld'].some(f => (h[f] === true) !== (b.state[f] === true)))) throw new Error('the header does not describe the block inside it');
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
  const seenBy = e => !Array.isArray(e.block.state.audience) || Boolean(asker && e.copies && e.copies[asker]);
  const headerView = b => ({ hash: b.hash, state: { seq: b.state.seq === undefined ? null : b.state.seq, audience: ['sealed'] }, refs: { author: b.refs.author === undefined ? null : b.refs.author, prev: b.refs.prev === undefined ? null : b.refs.prev } });
  // a genesis has no public header (decision H10): to an asker outside its audience nothing of a sealed genesis is sent
  const isGen = b => b.type === 'actor' && b.refs.author === undefined && b.state.seq === undefined && isStr(b.state.public_key_sign);
  let found = log.filter(e => nOf(e) > since && (seenBy(e) ? matches(e.block, request.filter, held) : !isGen(e.block) && matches(headerView(e.block), request.filter, held))).sort((a, b) => nOf(a) - nOf(b));
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
      if (o && !have.has(other)) { have.add(other); proofs.push(o); }
    }
  }
  found = found.concat(proofs).sort((a, b) => nOf(a) - nOf(b));
  const messageOf = e => {
    const a = e.block.state.audience;
    if (a === 'public' || !Array.isArray(a)) return wrap(e.block);
    const copy = asker && e.copies && e.copies[asker];
    if (copy) return copy;
    return { header: e.header || header(e.block), header_signature: e.header_signature !== undefined ? e.header_signature : e.block.signature };
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
  if (isObj(p.receipt)) answer.receipt = p.receipt;
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
  if (!isObj(m) || Object.keys(m).some(k => !P.messages.public_block.includes(k)) || !P.messages.public_block.every(k => k in m)) throw cryptoError('a message is exactly { block, signature }', 'shape');
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
// within_limit (authority.md, The limit is the principal's fence): on the principal's node, whether one block of value stays inside the fence, given what
// was spent in the period (minor units, or the amount's value: a whole number or a decimal string), all compared exactly. A cap on each block holds
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
  // ruled: the judge's head ruling on the deal awards something to the person (promises.md, Rulings)
  if ('ruled' in c) { const r = ruledFor(c, pool, now); return !!r && r.ruling !== undefined; }
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
// the keeper a block is a block of (blocks.md, A named clock): each name is a block id and names a line, that block's key's blocks after it (a person's id names
// her genesis key's line); the name, which counts once (folds.md, Counts: a count counts ids), or null. `circle#role` is gone.
function keeperVoice(o, ks, pool) {
  const s = isStr(o.refs.author) ? signerFrom(o, pool) : null;
  if (!s) return null;
  for (const n of ks.names) {
    const B = pool.get(n);
    if (!B) continue;
    if (B.type === 'actor' && B.refs.author === undefined) { if (o.refs.author === B.hash && s.key === B.state.public_key_sign) return n; continue; }
    const sb = isStr(B.refs.author) ? signerFrom(B, pool) : null;
    if (sb && o.refs.author === B.refs.author && s.key === sb.key && Number.isInteger(o.state.seq) && o.state.seq > B.state.seq) return n;
  }
  return null;
}
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
  if ('ruled' in c) return pool.all().filter(b => b.type === 'observe' && b.state.kind === 'ruling').map(b => b.hash);
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
  const wkst = R.WKST === undefined ? 1 : RR_WD[R.WKST];
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
  const prof = P.optional_profiles['short-form'].short_reply;
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
  const pool = poolOf(heldIn), prof = P.optional_profiles['short-form'].short_reply;
  if (!isStr(text) || !text.startsWith(prof.prefix)) return null;
  const raw = Buffer.from(text.slice(prof.prefix.length), 'base64url');
  if (raw.length < 77) return null;
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
// GUESS: [S2-18] "Two continuations of one line are a pair" (folds.md) is not built: pairs are two blocks of one key on one prev or seq, and nothing more.
function walkLine(pool, id, start) {
  const lacks = [], seen = new Set();
  const keyOf = e => { const k = keyRefOf(e); return k === undefined ? null : k; };
  const seqOf = e => (isObj(e.state) && Number.isInteger(e.state.seq) ? e.state.seq : 0);
  let cur = pool.get(id);
  if (!cur) return { reached: false, ended: false, lacks: [id] };
  for (;;) {
    if (seen.has(cur.hash)) throw argError('the line runs in a ring');
    seen.add(cur.hash);
    if (cur.type === undefined) lacks.push(cur.hash); // held only as its header, or not read: needed whole
    if (cur.hash === start) return { reached: true, ended: false, lacks };
    const prev = cur.refs.prev;
    if (!isStr(prev)) return { reached: false, ended: true, lacks };
    const kg = pool.get(prev);
    const next = keyRefOf(cur) === prev && kg && isObj(kg.state) && isStr(kg.state.counted_to) ? kg.state.counted_to : prev;
    const n = pool.get(next);
    if (n) { cur = n; continue; }
    lacks.push(next);
    if (next === start) return { reached: true, ended: false, lacks };
    const author = cur.refs.author, key = keyOf(cur), seq = seqOf(cur);
    const same = e => isObj(e.refs) && e.refs.author === author && keyOf(e) === key;
    let below = null;
    for (const e of pool.all()) if (same(e) && seqOf(e) >= 1 && seqOf(e) < seq - 1 && (!below || seqOf(e) > seqOf(below))) below = e;
    const st = isStr(start) ? pool.get(start) : undefined;
    const floor = below ? seqOf(below) : st && same(st) ? seqOf(st) : 0;
    if (cur.state.skip !== true) for (let k = seq - 2, c = 0; k > floor && c < P.limits.gaps_max; k--, c++) lacks.push({ author, key, seq: k });
    if (!below) return { reached: false, ended: false, lacks };
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
// line each of those blocks reads back to where its key's line begins (GUESS: the text says "the lines each one's answers read, from the block back to their starts", and the starts
// are what each fold names, so the oracle takes the line of the block's own key), and the door log. A block another author sealed goes as its header.
const logIdOf = b => (b.refs.key !== undefined ? b.refs.key : b.refs.author);
function exportOf(person, heldIn, logId) {
  const pool = poolOf(heldIn), want = new Map();
  const add = b => { if (b && !want.has(b.hash)) want.set(b.hash, b); };
  const onLog = pool.all().filter(b => b.type !== undefined && logIdOf(b) === logId);
  for (const b of onLog) { add(b); for (const h of asList(b.refs.derives_from)) add(pool.get(h)); }
  for (const b of pool.all()) if (b.refs && b.refs.author === person) add(b);
  const idx = buildIdx(pool.all());
  for (const b of [...want.values()]) {
    for (const h of piecesOf(b, idx).have) add(pool.get(h));
    for (let steps = 0, x = b; steps < 100000 && x && x.refs && isStr(x.refs.prev); steps++) { const p = pool.get(x.refs.prev); if (!p) break; add(p); x = p; if (p.type !== undefined && isGenesisBlock(p)) break; }
  }
  const messages = [...want.values()].sort(byHash).map(b => (b.type !== undefined ? wrap(b) : { header: header(b), header_signature: b.header_signature }));
  return { format: 'application/foodblock+json', messages };
}
// export_whole(doc, log, last): whether an export is whole (nodes.md, A host, Her record at a host; protocol.json door.ops.export_whole), as { whole, lacks }. The receipts come
// opened. lacks, each once, ids ascending then { author, key, seq } by author, key (null first), seq: what the door log lacks from `last` back to the block that brought its key
// in; each block a receipt on the log names that is not in it, unless a dropped on the log names it or its receipt; each piece of a block in it that is not in it; each block
// a receipt names that is not in it and that the line of a block in it lacks, read back to where the line begins.
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
  for (const e of pool.all()) for (const x of walkLine(pool, e.hash, null).lacks) if (isStr(x) && named.has(x) && !all.has(x)) lacks.push(x);
  const ids = [...new Set(lacks.filter(isStr))].sort();
  const seen = new Set(), nums = lacks.filter(x => !isStr(x)).filter(x => { const k = jcs(x); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => cmp(a.author, b.author) || (a.key === b.key ? 0 : a.key === null ? -1 : b.key === null ? 1 : cmp(a.key, b.key)) || a.seq - b.seq);
  return { whole: ids.length + nums.length === 0, lacks: [...ids, ...nums] };
}

// ================================================================ the door: one case per rule
// every argument is JSON as I-JSON writes it: a string holding a lone surrogate is no text, and an argument error (protocol.json door.conventions.text)
const notText = v => (typeof v === 'string' ? lonePair(v) : Array.isArray(v) ? v.some(notText) : isObj(v) ? Object.entries(v).some(([k, x]) => lonePair(k) || notText(x)) : false);
function door(op, ...a) {
  if (a.some(notText)) throw argError('an argument holds a string that is not well-formed text');
  // a list argument (written [...] in the op's args in protocol.json) given as anything but a list, or null, is an argument error: never read as the empty list
  ((P.door.ops[op] || {}).args || []).forEach((spec, i) => {
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
    case 'open_copy': return openCopy(a[0], a[1]);
    // the ids a block names for its meaning, ascending; with `held`, those not held (a block held by its header alone is held)
    case 'needs': { if (a[1] === undefined || a[1] === null) return needsOf(a[0]); const have = new Set(normEntries(heldList(a[1])).map(e => e.hash)); return needsOf(a[0]).filter(h => !have.has(h)); }
    case 'read': return readFindings(a[0], a[1], a[2]);
    case 'read_whole': return readWhole(a[0], a[1], a[2]);
    case 'log_shown': return logShown(a[0], a[1], a[2], a[3]);
    case 'export_whole': return exportWhole(a[0], a[1], a[2]);
    // the core's own convenience (sdk/door.table): a signed push checked against the keys given
    case 'push_refusals': return pushRefusals(a[0], a[1]);
    case 'accept': { const r = accept(a[0], a[1], pairChoice(a[2], 'takes_pairs'), Array.isArray(a[3]) ? a[3] : undefined); return { ...r, taken: r.taken.map(b => b.hash), unread: r.unread }; }
    case 'past_of': return pastOfBlock(a[0], a[1]);
    case 'sees': return pastOfBlock(a[0], a[2]).includes(a[1].hash);
    case 'may_act_as': return mayActAs(a[0], a[1], a[2], a[3]);
    case 'speaks_for': return speaksFor(a[0], a[1]);
    case 'account_of': return accountOf(a[0], a[1]);
    case 'backed': return backed(a[0], a[1], a[2]);
    case 'backed_all': return backedAll(a[0], a[1]);
    case 'owed_back': return owedBack(a[0], a[1]);
    case 'gives': return gives(a[0], a[1], a[2]);
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
      if (n === 'all') return m;
      const sh = shareOfMembers(n);
      if (sh) return Math.max(1, Math.ceil(m * sh[0] / sh[1]));
      return Number.isInteger(n) && n >= 1 && n <= m ? n : null;
    }
    case 'ruling_releases': return rulingReleases(a[0], a[1], a[2] === undefined || a[2] === null ? null : a[2]);
    case 'circle_state': return circleState(a[0], a[1], a[2]);
    case 'circle_versions': return circleVersions(a[0], a[1]);
    case 'circle_key': return circleKey(a[0], a[1]); // profiles/rekeys.md
    case 'members_then': return membersThen(a[0], a[1], a[2]);
    case 'operators_of': return operatorsOf(a[0], a[1]);
    case 'under_ok': { const b = a[0], pool = readWith(a[1], b); return !!pool.get(b.hash) && whyNotUnder(b, pool).length === 0; } // a block no node would take is no word
    case 'ownership': return ownershipFold(a[0], a[1], undefined, clock(a[2], false) || '');
    case 'ownership_view': { const p = new Pool([a[0], ...poolOf(a[1]).all()]); return ownershipFold(a[0], p, undefined, clock(a[2], false) || ''); }
    case 'where_now': return whereNow(a[0], a[1]);
    case 'shares_on': return sharesOn(a[0], a[1]);
    case 'use_shown': return useShown(a[0], a[1], a[2]);
    case 'not_free_shown': return notFreeShown(a[0], a[1]);
    case 'invasion_shown': return invasionShown(a[0], a[1]);
    case 'release_shown': return releaseShown(a[0], a[1]);
    case 'bids_shown': return bidsShown(a[0], a[1]);
    case 'pot': return potFold(a[0], a[1], clock(a[2], false) || '');
    case 'spec': return { protocol: P };
    case 'push_answer': return buildPushAnswer(a[0], a[1], a[2], a[3]);
    case 'matches': return matches(a[0], a[1], a[2]);
    case 'answer_pull': {
      const c = a[4];
      if (!isObj(c) || !Number.isInteger(c.cap) || c.cap < 1) throw argError('choices.cap is a whole number of at least 1: the node states it');
      return answerPull(a[0], a[1], a[2], a[3], { cap: c.cap, serves_pairs: pairChoice(c, 'serves_pairs') }, a[5], a[6], a[7], a[8] === null ? undefined : a[8]);
    }
    case 'keypair': return keypair(a[0], a[1]);
    case 'sign': return signBlock(a[0], a[1], a[2]);
    case 'verify': return verifyBlock(a[0], a[1], a[2]);
    case 'hash': return hashOfBlock({ type: a[0], state: a[1], refs: a[2] }, a[3]);
    case 'valid': return valid(a[0], a[1]);
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
    case 'key_hash': return keyHash(a[0], a[1]);
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
    case 'identity_state': { const f = identityFold(a[0], a[1]); return { signed_by_author: { ...f.signed_by_author }, voices: f.voices, keepers: f.keepers, keys: f.keys, waiting: f.waiting, operators: f.operators }; }
    // blocks.md, Finality, read on the blocks held with no clock and no arrival
    case 'stands': { const b = a[0], pool = readWith(a[1], b); return standsOf(pool.get(b.hash) || b, pool); }
    case 'short_reply': return shortReplyText(a[0]);
    case 'short_reply_open': return shortReplyOpen(a[0], a[1], a[2]);
    case 'promise_stage': return promiseStage(a[0], a[1], a[2]);
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
    case 'earnest_shape_ok': return earnestShapeOk(a[0]);
    case 'earnest_paid': return earnestPaid(a[0], a[1], a[2]);
    case 'reading_is_persons_claim': return readingIsPersonsClaim(a[0], a[1], a[2]);
    case 'reading_condition_holds': return readingConditionHolds(a[0], a[1], clock(a[2], true));
    default: throw new Error('the oracle has no op ' + op);
  }
}

// ================================================================ exports
module.exports = {
  P, door, jcs, canonical, canonOf, hashBytes, hashStr, hashOfBlock, saltedHash, keyHash, shortCode, standsOf, shortReplyText, shortReplyOpen, keypair, signBlock, verifyBlock, verifyBytes, signBytes,
  seal, open, suiteOfKey, encPublicOf, strictText, strictPush, contentFindings, writeFindings, readFindings, readWhole, walkLine, logShown, buildPushAnswer, onLine, exportOf, exportWhole, headerEntry, normHeld, Pool, identityFold, operatorsOf, addDur, valid, validStages,
  cborEncode, cborDecode, cborHeader, cborHeaderDecode, cborEncodePush, cborDecodePush, chainFold, forkPairs, nextLink, header, matches, accept,
  whyNotUnder, circleFold, circleState, mayActAs, membersThen, circleKey, countedIn, promiseStage, promiseView, due, ownershipFold, whereNow,
  consentFold, isStranger, speaksFor, backed, backedAll, owedBack, listingCheck, checkReads, clearingApplied, rulingReleases, rulingAudience, gives, accountOf, scopeReading, admissionRefusals, residencyRefusals, earnestShapeOk, earnestPaid, readingIsPersonsClaim, signMessage, verifyMessage, pullRefusals, pushRefusals,
  answerSignedBy, pushAnswer, pushRequest, wellKnownErrors, announcement, openCopy, headerSignedBy, wrap, unwrap, counts, grantLive,
};
