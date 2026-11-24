'use strict';
// The oracle's part for bytes (canonical.md; core.md, section 2; privacy.md; encoding.md): the canonical form, hashes and suites, keys and signatures, envelopes, CBOR, the Merkle root.
const Basics = require('./basics.cjs');
const Check = require('./check.cjs');
const Consent = require('./consent.cjs');
const Deals = require('./deals.cjs');
const Identity = require('./identity.cjs');
const Things = require('./things.cjs');
// ================================================================ canonical form (canonical.md)
// RFC 8785 (JCS). Writing never sorts sets or drops anything: strict writing is a CHECK (below), not a repair.
function jcs(v) {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return Object.is(v, -0) ? '0' : String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(jcs).join(',') + ']';
  // members in ascending order of the UTF-8 bytes of their keys' characters (never of UTF-16 units or escapes)
  if (typeof v === 'object') return '{' + Object.keys(v).sort(Basics.byBytes).filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + jcs(v[k])).join(',') + '}';
  throw new Error('not JSON');
}
const canonical = (type, state, refs) => jcs({ type, state, refs });
const canonOf = b => canonical(b.type, b.state, b.refs);

// ================================================================ hashes and suites (core.md section 2)
const cryptoError = (msg, code) => { const e = new Error(msg); e.kind = 'crypto'; if (code) e.code = code; return e; };
const suiteOf = name => { const s = name === undefined || name === null ? 'std' : name; if (!Basics.SUITES.includes(s)) throw cryptoError('unknown suite ' + s, 'unknown_suite'); return s; };
const hashName = suite => ({ std: 'sha256', p256: 'sha256', sm: 'sm3' })[suiteOf(suite)];
function hashBytes(suite, bytes) {
  const n = hashName(suite);
  const h = Basics.crypto.createHash(n).update(bytes).digest('hex');
  return n === 'sha256' ? h : n + ':' + h;
}
const hashStr = (suite, s) => hashBytes(suite, Buffer.from(s, 'utf8'));
const hashOfBlock = (b, suite) => hashStr(suite, canonOf(b));
const sha256 = s => Basics.crypto.createHash('sha256').update(s).digest('hex');

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
  const hmac = (key, ...parts) => Basics.crypto.createHmac(hashName, key).update(Buffer.concat(parts)).digest();
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
  const d = fromHex(dHex), h1 = Basics.crypto.createHash('sha256').update(msg).digest(), e = fromHex(h1.toString('hex')), n = P256.n;
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
  return Basics.crypto.createHash('sm3').update(Buffer.concat(parts)).digest();
}
const sm2E = (pubPoint, msg) => fromHex(Basics.crypto.createHash('sm3').update(Buffer.concat([sm2Z(pubPoint), msg])).digest('hex'));
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
const sm4ecb = (key, block) => { const c = Basics.crypto.createCipheriv('sm4-ecb', key, null); c.setAutoPadding(false); return Buffer.concat([c.update(block), c.final()]); };
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
  if (decrypt && !Basics.crypto.timingSafeEqual(tag, tagIn)) throw cryptoError('authentication failed');
  return { out, tag };
}

// ================================================================ keys, signatures (core.md section 2)
const SPKI_PREFIX = { std: Basics.P.suites.std.sign_key.spki_prefix, p256: Basics.P.suites.p256.sign_key.spki_prefix, sm: Basics.P.suites.sm.sign_key.spki_prefix };
// a `p256` key's point is written uncompressed, with first byte `04`; any other spelling is no key
// a p256 key's point is written uncompressed, first byte 04 (protocol.json suites.p256.sign_key.grammar)
const keyGrammar = s => new RegExp(Basics.P.suites[s].sign_key.grammar);
const encGrammar = s => new RegExp(Basics.P.suites[s].encrypt_key.grammar);
// An encryption key (core.md, section 2): the suite's own bare, or a name, a colon and a key. A key named xwing: is an X-Wing key and must match its grammar (else `grammar`);
// a named key whose name this reader does not know is skipped, never refused (the rest of the block stands); anything else is not a key of the suite (`unknown_suite`).
const XW = () => Basics.P.encrypt_keys;
function encKeyProblem(key, suite) {
  if (!Basics.isStr(key)) return 'unknown_suite';
  if (key.startsWith(XW().xwing.prefix)) return new RegExp(XW().xwing.grammar).test(key) ? null : 'grammar';
  if (encGrammar(suite).test(key)) return null;
  return new RegExp(XW().named).test(key) ? null : 'unknown_suite';
}
const sigGrammar = s => new RegExp(Basics.P.suites[s].signature.grammar);
const passkeyGrammar = () => new RegExp(Basics.P.suites.p256.signature.passkey.grammar);
// The suite a signing key (SPKI hex) belongs to, by its grammar. null when none.
function suiteOfKey(spki) { for (const s of Basics.SUITES) if (typeof spki === 'string' && keyGrammar(s).test(spki)) return s; return null; }
const rawPoint = spki => spki.slice(SPKI_PREFIX.p256.length);
function keypair(seedHex, suite) {
  const s = suiteOf(suite);
  if (s === 'std') {
    const pk = Basics.crypto.createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), Buffer.from(seedHex, 'hex')]), format: 'der', type: 'pkcs8' });
    const pub = Basics.crypto.createPublicKey(pk).export({ format: 'der', type: 'spki' }).toString('hex');
    return { public_key_sign: pub, private_key: pk.export({ format: 'der', type: 'pkcs8' }).toString('hex'), suite: 'std' };
  }
  if (s === 'p256') { const e = Basics.crypto.createECDH('prime256v1'); e.setPrivateKey(Buffer.from(seedHex, 'hex')); return { public_key_sign: SPKI_PREFIX.p256 + e.getPublicKey('hex'), private_key: seedHex, suite: 'p256' }; }
  return { public_key_sign: SPKI_PREFIX.sm + sm2PubFromPriv(seedHex), private_key: seedHex, suite: 'sm' };
}
function signBytes(bytes, privHex, suite) {
  const s = suiteOf(suite);
  if (s === 'std') return Basics.crypto.sign(null, bytes, Basics.crypto.createPrivateKey({ key: Buffer.from(privHex, 'hex'), format: 'der', type: 'pkcs8' })).toString('hex');
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
const keySound = spki => !(Basics.isStr(spki) && spki.startsWith(SPKI_PREFIX.std)) || (spki.length === SPKI_PREFIX.std.length + 64 && edSound(Buffer.from(spki.slice(SPKI_PREFIX.std.length), 'hex')));
// a P-256 signature's s is low: no more than half the group order (one signature, one written form)
const P256N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551n;
const lowS = rs => BigInt('0x' + rs.subarray(32, 64).toString('hex')) <= P256N / 2n;
const toLowS = rs => lowS(rs) ? rs : Buffer.concat([rs.subarray(0, 32), Buffer.from((P256N - BigInt('0x' + rs.subarray(32, 64).toString('hex'))).toString(16).padStart(64, '0'), 'hex')]);
const spkiKey = hex => Basics.crypto.createPublicKey({ key: Buffer.from(hex, 'hex'), format: 'der', type: 'spki' });
const ieeeKey = hex => ({ key: spkiKey(hex), dsaEncoding: 'ieee-p1363' }); // a P-256 signature is r||s
// a verdict is a pure function of its four arguments: remembered by their digest, so a fold that reads every signature again costs one check each
const VERDICTS = new Map();
function verifyBytes(bytes, sigHex, pubSpkiHex, suite) {
  const k = Basics.crypto.createHash('sha256').update(String(suite) + '|' + String(pubSpkiHex) + '|' + String(sigHex) + '|').update(bytes).digest('hex');
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
    if (!Basics.isStr(sigHex) || sigHex.length > 2 * Basics.P.limits.signature_bytes) return false; // a signature in any suite is at most limits.signature_bytes: a longer one opens with no key (encoding.md, Bytes)
    if (s === 'p256' && passkeyGrammar().test(sigHex)) return passkeyVerify(bytes, Buffer.from(sigHex, 'hex'), pubSpkiHex);
    if (!sigGrammar(s).test(sigHex)) return false;
    const sig = Buffer.from(sigHex, 'hex');
    if (s === 'std') {
      if (!keySound(pubSpkiHex) || !edSound(sig.subarray(0, 32)) || BigInt('0x' + Buffer.from(sig.subarray(32)).reverse().toString('hex')) >= EL) return false;
      return Basics.crypto.verify(null, bytes, spkiKey(pubSpkiHex), sig);
    }
    if (s === 'p256') return lowS(sig) && Basics.crypto.verify('sha256', bytes, ieeeKey(pubSpkiHex), sig);
    return sm2Verify(bytes, rawPoint(pubSpkiHex), sigHex);
  } catch { return false; }
}
// ---- passkeys (modules/encoding.md, Passkeys): a WebAuthn assertion as a p256 signature
// The challenge for signed bytes: base64url, no padding, of their SHA-256.
const passkeyChallenge = bytes => Basics.crypto.createHash('sha256').update(bytes).digest('base64url');
// sig: r||s (64) | length of authenticatorData (2, big-endian) | authenticatorData | clientDataJSON. The check is encoding.md's four: the form and the cap
// (limits.signature_bytes), bit 0 of the flags byte, clientDataJSON beginning with exactly the 91 bytes of the frame (no JSON is parsed), and the ECDSA signature
function passkeyVerify(bytes, sig, pubSpkiHex) {
  if (sig.length <= 64 || sig.length > Basics.P.limits.signature_bytes) return false;
  const n = sig.readUInt16BE(64), auth = sig.subarray(66, 66 + n), cdj = sig.subarray(66 + n);
  if (auth.length !== n || n < Basics.P.suites.p256.signature.passkey.min_authenticator_data_bytes || cdj.length === 0 || (auth[32] & 5) !== 5) return false; // bit 0 (user present) and bit 2 (user verified): a touch alone signs nothing
  const frame = Buffer.from('{"type":"webauthn.get","challenge":"' + passkeyChallenge(bytes) + '","origin":"', 'utf8');
  if (cdj.length < frame.length || !cdj.subarray(0, frame.length).equals(frame)) return false;
  const signed = Buffer.concat([auth, Basics.crypto.createHash('sha256').update(cdj).digest()]);
  if (!lowS(sig.subarray(0, 64))) return false;
  return Basics.crypto.verify('sha256', signed, ieeeKey(pubSpkiHex), sig.subarray(0, 64));
}
// The WebAuthn signature may be DER; the passkey signature is r||s. DER is one spelling of a value (X.690's distinguished rules): a SEQUENCE
// of two positive INTEGERs, each length in short form, no needless leading 00, nothing after. Any other spelling is not DER and is refused,
// as the core refuses it.
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
  const isBlock = Basics.isObj(v) && Basics.isStr(v.type) && Basics.isObj(v.state) && Basics.isObj(v.refs);
  const { signature, ...rest } = Basics.isObj(v) ? v : {};
  return passkeyChallenge(isBlock ? signedBytes(v, 'p256') : Buffer.from(jcs(rest), 'utf8'));
};
// What a key signs for a block (core.md, section 2): the block's header as canonical JSON, the header naming the block by its id in the key's suite and carrying `key`
// when the block names one; a genesis has no header and is signed over its own canonical bytes. Never the block's own bytes otherwise.
// a genesis is an actor that names its own signing key and has no author and no seq (the core's is_genesis);
// a block that names no key and no author is no genesis and lacks the common five (`chain`)
const isGenesisBlock = b => Basics.isObj(b) && b.type === 'actor' && Basics.isObj(b.state) && Basics.isObj(b.refs) && Basics.isStr(b.state.public_key_sign) && !('author' in b.refs) && !('seq' in b.state);
// an actor read against the genesis's fields (no author, or a signing key named), genesis or not: its closed type is the genesis's, never an actor's
const readsAsGenesis = b => Basics.isObj(b) && b.type === 'actor' && Basics.isObj(b.state) && Basics.isObj(b.refs) && (b.refs.author === undefined || 'public_key_sign' in b.state);
const headerBytes = (b, suite) => Basics.isObj(b.refs) && Basics.isObj(b.state) && b.refs.author !== undefined ? Buffer.from(jcs(Identity.header({ ...b, hash: hashOfBlock(Check.blockOnly(b), suite || 'std') })), 'utf8') : null;
const signedBytes = (b, suite) => (!isGenesisBlock(b) && headerBytes(b, suite)) || Buffer.from(canonOf(b), 'utf8');
const signBlock = (b, privHex, suite) => signBytes(signedBytes(b, suite), privHex, suite);
// The key's own suite decides the algorithm (its SPKI prefix names it); only the header (a genesis: its own bytes) opens. The body form does not open.
const verifyBlock = (b, sigHex, pubHex, suite) => verifyBytes(signedBytes(b, suite || suiteOfKey(pubHex) || 'std'), sigHex, pubHex, suite);

// ================================================================ envelopes (privacy.md)
const ENVELOPE = { std: 'x25519-hkdf-sha256-aes-256-gcm', p256: 'p256-hkdf-sha256-aes-256-gcm', sm: 'sm2-hkdf-sm3-sm4-gcm' };
const suiteOfAlg = alg => Object.keys(ENVELOPE).find(s => ENVELOPE[s] === alg);
const xPrivKey = dHex => Basics.crypto.createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b656e04220420', 'hex'), Buffer.from(dHex, 'hex')]), format: 'der', type: 'pkcs8' });
const xPubKey = xHex => Basics.crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b656e032100', 'hex'), Buffer.from(xHex, 'hex')]), format: 'der', type: 'spki' });
const ecdh = s => Basics.crypto.createECDH(s === 'p256' ? 'prime256v1' : 'SM2');
// The encryption public key for a private one, in a suite.
function encPublicOf(dHex, suite) {
  const s = suiteOf(suite);
  if (s === 'std') return Basics.crypto.createPublicKey(xPrivKey(dHex)).export({ format: 'der', type: 'spki' }).subarray(12).toString('hex');
  const e = ecdh(s); e.setPrivateKey(Buffer.from(dHex, 'hex')); return e.getPublicKey('hex');
}
function agree(suite, privHex, pubHex) {
  const s = suiteOf(suite);
  if (s === 'std') return Basics.crypto.diffieHellman({ privateKey: xPrivKey(privHex), publicKey: xPubKey(pubHex) });
  const e = ecdh(s); e.setPrivateKey(Buffer.from(privHex, 'hex'));
  return e.computeSecret(Buffer.from(pubHex, 'hex'));
}
const kdfHash = s => (s === 'sm' ? 'sm3' : 'sha256');
// SM4 takes a 16-byte key: in the sm suite the content key is the first 16 bytes (privacy.md, Key sizes)
const cipherKey = (s, k) => (s === 'sm' ? k.subarray(0, 16) : k);
function gcmSeal(s, key, iv, pt) {
  if (s === 'sm') { const { out, tag } = sm4gcm(cipherKey(s, key), iv, pt, false); return { ct: out, tag }; }
  const c = Basics.crypto.createCipheriv('aes-256-gcm', key, iv); const ct = Buffer.concat([c.update(pt), c.final()]); return { ct, tag: c.getAuthTag() };
}
function gcmOpen(s, key, iv, ct, tag) {
  if (s === 'sm') return sm4gcm(cipherKey(s, key), iv, ct, true, tag).out;
  const d = Basics.crypto.createDecipheriv('aes-256-gcm', key, iv); d.setAuthTag(tag); return Buffer.concat([d.update(ct), d.final()]);
}
function envKey(s, secret, ephHex, recipHex) {
  return Buffer.from(Basics.crypto.hkdfSync(kdfHash(s), secret, Buffer.concat([Buffer.from(ephHex, 'hex'), Buffer.from(recipHex, 'hex')]), Buffer.from(Basics.C.envelope.hkdf_info, 'utf8'), 32));
}
// seal(plaintext, [recipient encryption keys], suite, fixed?); fixed = { ephemeral (private hex), contentKey, nonce, keyNonces[] } for tests.
// a sealer that pads pads the plaintext to the next of 512, 1024, 2048, 4096 bytes, then each 4096. The plaintext is { block, reveals, pad }, `pad` a string of spaces.
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
  if (!eph) { if (s === 'std') eph = Basics.crypto.randomBytes(32).toString('hex'); else { const e = ecdh(s); e.generateKeys(); eph = e.getPrivateKey('hex').padStart(64, '0'); } }
  const ephPub = encPublicOf(eph, s);
  const ck = f.contentKey ? Buffer.from(f.contentKey, 'hex') : Basics.crypto.randomBytes(32), iv = f.nonce ? Buffer.from(f.nonce, 'hex') : Basics.crypto.randomBytes(12);
  const body = gcmSeal(s, ck, iv, Buffer.from(JSON.stringify(plaintext), 'utf8'));
  const recips = recipients.map((r, i) => {
    const k = envKey(s, agree(s, eph, r), ephPub, r), n = f.keyNonces ? Buffer.from(f.keyNonces[i], 'hex') : Basics.crypto.randomBytes(12);
    const sk = gcmSeal(s, k, n, ck);
    return { encrypted_key: Buffer.concat([sk.ct, sk.tag, n]).toString('base64') };
  });
  return { alg: ENVELOPE[s], ephemeral_key: ephPub, nonce: iv.toString('base64'), ciphertext: Buffer.concat([body.ct, body.tag]).toString('base64'), recipients: recips };
}
// An X-Wing envelope (privacy.md, A KEM key; draft-connolly-cfrg-xwing-kem-11), opened with Node's own crypto: SHAKE256, SHA3-256, X25519 and ML-KEM-768 (decapsulate, from the seed d || z in a PKCS#8 key).
// The oracle only opens: Node has no encapsulation from fixed bytes, so the vectors are sealed by the core.
const XWING_LABEL = Buffer.from('5c2e2f2f5e5c', 'hex');
function xwingKeys(seedHex) {
  const sk = Buffer.from(seedHex, 'hex');
  if (sk.length !== 32) throw cryptoError('an X-Wing private seed is 32 bytes');
  const ex = Basics.crypto.createHash('shake256', { outputLength: 96 }).update(sk).digest();
  // PKCS#8, ML-KEM-768 (2.16.840.1.101.3.4.4.2), the seed form [0] OCTET STRING (64)
  const mk = Basics.crypto.createPrivateKey({ key: Buffer.concat([Buffer.from('3054020100300b06096086480165030404020442' + '8040', 'hex'), ex.subarray(0, 64)]), format: 'der', type: 'pkcs8' });
  const xk = xPrivKey(ex.subarray(64).toString('hex'));
  const pkM = Basics.crypto.createPublicKey(mk).export({ format: 'der', type: 'spki' }).subarray(-1184);
  const pkX = Basics.crypto.createPublicKey(xk).export({ format: 'der', type: 'spki' }).subarray(12);
  return { mk, xk, pk: Buffer.concat([pkM, pkX]), pkX };
}
const xwingPublicOf = seedHex => 'xwing:' + xwingKeys(seedHex).pk.toString('hex');
function xwingDecaps(keys, ct) {
  if (ct.length !== 1120) throw cryptoError('an X-Wing ciphertext is 1120 bytes');
  const ctM = ct.subarray(0, 1088), ctX = ct.subarray(1088);
  const ssM = Basics.crypto.decapsulate(keys.mk, ctM);
  const ssX = Basics.crypto.diffieHellman({ privateKey: keys.xk, publicKey: xPubKey(ctX.toString('hex')) });
  return Basics.crypto.createHash('sha3-256').update(Buffer.concat([ssM, ssX, ctX, keys.pkX, XWING_LABEL])).digest();
}
function openXwing(env, seedHex) {
  const keys = xwingKeys(seedHex);
  const c = Buffer.from(env.ciphertext, 'base64'), iv = Buffer.from(env.nonce, 'base64');
  for (const r of env.recipients || []) {
    const ct = Buffer.from(r.kem_ciphertext || '', 'base64'), b = Buffer.from(r.encrypted_key || '', 'base64');
    if (ct.length !== 1120 || b.length !== 60) continue;
    const k = Buffer.from(Basics.crypto.hkdfSync('sha256', xwingDecaps(keys, ct), Buffer.concat([ct, keys.pk]), Buffer.from(Basics.C.envelope.hkdf_info, 'utf8'), 32));
    let ck; try { ck = gcmOpen('std', k, b.subarray(48, 60), b.subarray(0, 32), b.subarray(32, 48)); } catch { continue; }
    try { return JSON.parse(gcmOpen('std', ck, iv, c.subarray(0, c.length - 16), c.subarray(c.length - 16)).toString('utf8')); } catch { throw cryptoError('the envelope does not open'); }
  }
  throw cryptoError('not a recipient');
}

// open(envelope, private key hex) -> plaintext object. A reader opens only the envelopes its suites name. An X-Wing envelope takes the 32-byte private seed.
function open(env, privHex) {
  if (env && env.alg === XW().xwing.envelope) return openXwing(env, privHex);
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

// ================================================================ the compact form (encoding.md, CBOR)
// A public block as CBOR (RFC 8949). The id is always the hash of the canonical JSON. Writing is deterministic; a reader refuses
// indefinite lengths, floats, tags, null, undefined, duplicate keys and integers outside +-(2^53 - 1).
const CB = Basics.C.cbor, MAXBI = BigInt(Basics.P.integers.max);
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
const TYPE_INDEX = Object.keys(Basics.P.types);
// a map key: its index in the key table when the short form is asked and the table has it, else its text
const cbKey = (k, short) => (short && CB.keys.includes(k) ? { int: BigInt(CB.keys.indexOf(k)) } : { text: k });
function cbOut(v, path, short) {
  if (typeof v === 'boolean') return { bool: v };
  if (typeof v === 'number') {
    if (!Number.isInteger(v) || Math.abs(v) > Basics.P.integers.max) throw new Error('cbor: ' + path.join('.') + ' is not an integer in range');
    return { int: BigInt(v) };
  }
  if (typeof v === 'string') {
    const kind = cbKind(path);
    if (kind === 'hash' && Check.RX.hash.test(v)) return { bytes: Buffer.from(v, 'hex') };
    if (kind === 'sign' && suiteOfKey(v)) return { bytes: suiteOfKey(v) === 'std' ? Buffer.from(v, 'hex').subarray(STD_PREFIX.length) : Buffer.from(v, 'hex') };
    if (kind === 'enc' && (/^[0-9a-f]{64}$/.test(v) || /^04[0-9a-f]{128}$/.test(v))) return { bytes: Buffer.from(v, 'hex') };
    if (kind === 'nonce' && Check.RX.nonce.test(v)) return { bytes: Buffer.from(v, 'hex') };
    return { text: v };
  }
  if (Array.isArray(v)) return { array: v.map(x => cbOut(x, [...path, '[]'], short)) };
  const key = k => cbKey(k, short);
  const here = timePlace(path);
  return { map: Object.entries(v).map(([k, x]) => {
    const p = [...path, k];
    let val;
    if (path.length === 0 && k === 'type' && short && TYPE_INDEX.includes(x)) val = { int: BigInt(TYPE_INDEX.indexOf(x)) };
    else if (here && Basics.TIME_FIELDS.includes(k) && typeof x === 'string' && Check.RX.time.test(x)) val = { int: BigInt(Date.parse(x)) };
    else if (here && k === 'when' && Basics.isObj(x)) val = { map: Object.entries(x).map(([wk, wv]) => [key(wk), (wk === 'from' || wk === 'to') && typeof wv === 'string' && Check.RX.time.test(wv) ? { int: BigInt(Date.parse(wv)) } : cbOut(wv, [...p, wk], short)]) };
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
    if (depth > Basics.READ_DEPTH) throw new Error('cbor: too deep');
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
    else if (here && Basics.TIME_FIELDS.includes(n) && 'int' in x) { const ms = Number(x.int); if (!(ms >= -62167219200000 && ms <= 253402300799999)) throw new Error('cbor: a time outside the years 0000 to 9999'); out[n] = new Date(ms).toISOString(); }
    else if (here && n === 'when' && 'map' in x) {
      const w = {};
      for (const [wk, wv] of x.map) { const wn = name(wk); if (wn in w) throw new Error('cbor: duplicate key'); w[wn] = (wn === 'from' || wn === 'to') && 'int' in wv ? new Date(Number(wv.int)).toISOString() : cbIn(wv, [...p, wn]); }
      out[n] = w;
    } else out[n] = cbIn(x, p);
  }
  return out;
}
// cbor_decode(bytes or hex, given?) -> { hash, type, state, refs, signature }; the id is the hash of the rebuilt canonical JSON, in the suite of the
// key that signed it (core.md, section 2): with given, the author's key that opens it; without, the suite the block shows. Nothing follows the signature.
function cborDecode(input, blocks) {
  const buf = Buffer.isBuffer(input) || input instanceof Uint8Array ? Buffer.from(input) : Buffer.from(input, 'hex');
  const m = cbRead(buf);
  if (!('array' in m) || m.array.length !== 3 || !('int' in m.array[0]) || !('map' in m.array[1]) || !('bytes' in m.array[2])) throw new Error('cbor: a message is [t, block, signature]');
  const t = Number(m.array[0].int);
  if (t !== 0 && t !== CB.table) throw new Error('cbor: a key table this reader does not have');
  if (m.array[2].bytes.length < 64) throw new Error('cbor: a signature is 64 bytes (a passkey\'s, longer)');
  const b = cbIn(m.array[1], []);
  if (Object.keys(b).sort().join() !== 'refs,state,type' || !Basics.isObj(b.state) || !Basics.isObj(b.refs) || !Basics.isStr(b.type) || b.type === '') throw new Error('cbor: a block is { type, state, refs }');
  const out = { ...b, signature: m.array[2].bytes.toString('hex') };
  return { hash: Check.idOf(out, blocks), ...out };
}
function cborHeader(h, short) { // a chain header { author, seq, prev, hash }: ids as bytes
  const key = k => cbKey(k, short);
  const val = (k, x) => k === 'seq' ? { int: BigInt(x) } : (k === 'skip') ? { bool: x } : Check.RX.hash.test(x) ? { bytes: Buffer.from(x, 'hex') } : { text: x };
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

// ================================================================ large content: the Merkle root (encoding.md, Large content)
// Written from the text: leaf = SHA-256(00 || chunk); node = SHA-256(01 || left || right); an odd one at the end of a level is carried up.
const argError = msg => { const e = new Error(msg); e.kind = 'argument'; return e; };
// a node's own stated choice: a boolean in the object the call takes, never a default
const pairChoice = (choices, name) => { if (!Basics.isObj(choices) || typeof choices[name] !== 'boolean') throw argError('choices.' + name + ' is true or false: the node states it'); return choices[name]; };
// a clock (core.md section 3): a time; null or absent is none unless one is needed; anything else is refused at the door
// an arrival log { hash: time }: each arrival is a time, like a clock (folds.md); anything else is refused, never read as a time
const arrivalsArg = v => { if (!Basics.isObj(v)) return null; for (const t of Object.values(v)) if (t !== null && (!Basics.isStr(t) || !Check.RX.time.test(t) || Check.timeProblem(t))) throw argError('an arrival is a time'); return v; };
const clock = (v, needed) => { if ((v === undefined || v === null) && !needed) return undefined; if (Basics.isStr(v) && Check.RX.time.test(v) && !Check.timeProblem(v)) return v; throw argError('a clock is a time'); };
const merkleLeaf = chunk => Basics.crypto.createHash('sha256').update(Buffer.concat([Buffer.from([0]), chunk])).digest();
const merkleNode = (l, r) => Basics.crypto.createHash('sha256').update(Buffer.concat([Buffer.from([1]), l, r])).digest();
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
  if (!Basics.isObj(st) || !Array.isArray(st.marks)) return false;
  const roots = st.marks.filter(m => Basics.isObj(m) && m.scheme === 'merkle');
  if (roots.length !== 1 || !Basics.isStr(roots[0].value) || !Number.isInteger(st.chunks) || st.chunks < 1) return false;
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
// what is to come to her. With refs.subject it lets go of what is to come to her on that deal or thing. Without, it lets go of what is to come to her on every deal with refs.to (the other
// side) whose first promise it has in its causal past, except the deals state.except lists, which stay open. Only a side of a deal lets go of what is to come to it.
function releaseShown(subject, blocksIn) {
  const pool = new Check.Pool([subject, ...Check.poolOf(blocksIn).all()]);
  const sh = subject.hash;
  const deal = subject.type === 'promise' && subject.refs.answers === undefined;
  const sideOf = id => (!deal ? null : subject.refs.from === id ? 'from' : subject.refs.to === id ? 'to' : null);
  const released = [], kept = [];
  for (const o of pool.all()) {
    if (o.type !== 'observe' || o.state.kind !== 'release' || o.state.status !== undefined || !Identity.counts(o, pool)) continue;
    const by = Things.speakerOf(o, pool);
    if (!Basics.isStr(by)) continue;
    const side = sideOf(by);
    if (deal && side === null) continue;
    const entry = { block: o.hash, by, side, to: Basics.isStr(o.refs.to) ? o.refs.to : null };
    if (o.refs.subject !== undefined) { if (o.refs.subject === sh) released.push(entry); continue; }
    const other = side === 'from' ? subject.refs.to : subject.refs.from;
    if (!deal || !Basics.isStr(other) || o.refs.to !== other || !pool.sees(o.hash, sh)) continue;
    if (Check.asList(o.state.except).includes(sh)) kept.push({ block: o.hash, by, side }); else released.push(entry);
  }
  const sorted = l => l.sort((a, b) => Basics.cmp(a.block, b.block));
  return { subject: sh, released: sorted(released), kept_open: sorted(kept) };
}

// a condition (promises.md, Conditions), a view on the blocks given and the reader's clock: settled, a deed, a sensor's readings, or a signal
// a condition reads three ways (promises.md, Conditions): true, false (also for one of the four shapes written wrong), or null: a condition of any
// other shape is not read by the protocol
function conditionHolds(c, blocks, runNamed) {
  // a condition is read on the words in the past of the block that relies on it, never on a reader's clock
  const pool = Check.poolOf(blocks);
  if (!conditionReads(c)) return null;
  // `settled`, `paid` and `reading` are named readings: a block whose condition names one states, in `state.rule_set`, the rules that hold it; a reader that does not run them holds the block not read (`unknown_rules`). (the text does not say; read so)
  // This reader runs H₀ alone, which reads signed fields only: `settled` and `paid` are not read here, in any block (the condition is not read: null, and never holds); `reading` can never be shown (false). `ruled` is read from signed fields; the payee's signal, `{ signal: "paid", by: [payee], subject: deal }`, needs no reading.
  // The door op `condition_holds` is a reader that runs the named readings: `runNamed`.
  if (Basics.isStr(c.settled) || Basics.isStr(c.paid)) {
    if (runNamed !== true) return null; // the door never runs them; a reader that does passes runNamed
    const p = pool.get(Basics.isStr(c.settled) ? c.settled : c.paid), v = p && Deals.promiseStage(p, pool);
    if (!v || v.not_shown) return false;
    return Basics.isStr(c.settled) ? v.stage === 'done' : v.paidUp === true && v.total !== null && v.total !== undefined;
  }
  // accepted: that deal binds, read from its promise fold, no clock: accepted or further along, or stopped onward (it bound)
  if ('accepted' in c) { const p = Basics.isStr(c.accepted) && pool.get(c.accepted); return !!p && Deals.stageBinds(Deals.promiseStage(p, pool)); }
  // stopped: `{ stopped: <first promise>, side: "from" | "to" }` holds where a counted onward stop that speaks for that side is among the first onward stops of that deal and none that speaks for the other side is (the text does not say; read so)
  if ('stopped' in c) { const p = Basics.isStr(c.stopped) && pool.get(c.stopped); const st = p && p.type === 'promise' ? Deals.promiseStage(p, pool) : null; return !!st && !st.not_shown && st.stage === 'stopped' && st.stop === 'onward' && st.by === c.side; }
  if (Basics.isStr(c.deed)) { const b = pool.get(c.deed); return !!b && Identity.counts(b, pool); }
  // holds once that id's list is closed, read in the blocks the relying block holds
  if ('closed' in c) return Basics.isStr(c.closed) && Identity.identityFold(c.closed, pool).closed === true && !!pool.get(c.closed);
  // ruled: the judge's head ruling on the deal awards something to the person (promises.md, Rulings)
  if ('ruled' in c) { const r = Consent.ruledFor(c, pool); return !!r && r.ruling !== undefined; }
  // opened: a counted block carries the opening of the commitment (privacy.md): one hash comparison, in the suite the commitment names
  if ('opened' in c) {
    if (!Basics.isStr(c.opened)) return false;
    const suite = c.opened.startsWith('sm3:') ? 'sm' : 'std';
    return pool.all().some(b => Basics.isObj(b.state.opening) && Basics.isStr(b.state.opening.salt) && Check.RX.salt.test(b.state.opening.salt) && b.state.opening.value !== undefined && Identity.counts(b, pool) && saltedHash(b.state.opening.salt, b.state.opening.value, suite) === c.opened);
  }
  // by a time (promises.md): within holds when the inner condition held by the deadline, without when it did not
  if ('without' in c || 'within' in c) return byDeadline(c, blocks, pool);
  if (c.reading !== undefined) return null; // a bare reading is a named reading the core does not run: not read (it never holds, and can never be shown)
  // a signal (promises.md, Conditions): by a panel { names, needed }, subject one id, op and value
  // together (value an amount); any other shape does not hold
  if (!Basics.isStr(c.signal)) return false;
  const nameOk = w => Basics.isStr(w) && w !== '' && !w.includes('#'); // `circle#role` is no name
  // a panel of more than one name states how many: with none, the signal does not hold
  const panel = Check.panelOf(c.by, nameOk);
  if (panel === null) return false;
  if (c.subject !== undefined && !Basics.isStr(c.subject)) return false;
  const OPS = Object.fromEntries(Object.entries({ lt: k => k < 0, le: k => k <= 0, gt: k => k > 0, ge: k => k >= 0, eq: k => k === 0 }).filter(([k]) => Basics.P.condition_ops.includes(k)));
  if ((c.op === undefined) !== (c.value === undefined)) return false;
  if (c.op !== undefined && !(Basics.isStr(c.op) && Object.hasOwn(OPS, c.op) && Basics.isObj(c.value) && Basics.isStr(c.value.value) && Check.RX.decimal.test(c.value.value) && c.value.unit !== undefined)) return false;
  const by = panel.names, needed = panel.needed;
  // the voice is its signer: a signal under a grant speaks for its signer alone (authority.md, Blocks that bind: every block under a grant
  // that is none of those speaks for its signer alone)
  const voiceOf = o => o.refs.author;
  // a signer takes their own signal back by defeating it: the defeat is hers when it speaks for the voice the signal speaks for
  const withdrawn = o => pool.all().some(d => Check.asList(d.refs.defeats).includes(o.hash) && voiceOf(d) !== undefined && voiceOf(d) === voiceOf(o) && Identity.counts(d, pool));
  const signers = new Set();
  for (const o of pool.all()) {
    if (o.type !== 'observe' || o.state.kind !== c.signal || !Identity.counts(o, pool) || withdrawn(o)) continue; // a signal counts once it is counted, whatever its `at`
    if (c.subject !== undefined && !Check.asList(o.refs.subject).includes(c.subject)) continue;
    if (c.op !== undefined) { const a = o.state.amount; if (!Basics.isObj(a) || jcs(a.unit) !== jcs(c.value.unit) || !Check.tableEntry(OPS, c.op) || OPS[c.op](Deals.decCmp(a.value, c.value.value)) !== true) continue; }
    const author = voiceOf(o);
    if (by.some(w => w === author)) signers.add(author);
  }
  return Check.quorum(signers, needed);
}

// the protocol reads a condition when it has a key of condition_shapes, and a wrapper only around one it reads
const conditionReads = c => Basics.isObj(c) && ('without' in c || 'within' in c ? conditionReads('without' in c ? c.without : c.within) : (Basics.P.condition_shapes.some(k => k in c) || 'closed' in c)); // `{ closed: <id> }` holds once that id's list is closed
// what is wrong with a condition's shape, for the shapes the check reads (without, within, opened, paid): null when well formed
function conditionProblem(c) {
  if (!Basics.isObj(c)) return null;
  if ('without' in c || 'within' in c) {
    if (Object.keys(c).some(k => !['without', 'within', 'deadline', 'clocks'].includes(k)) || ('without' in c && 'within' in c)) return 'shape';
    if (!(Basics.isStr(c.deadline) && Check.timeProblem(c.deadline) === null) || Identity.clocksOf(c.clocks) === null) return 'shape';
    const inner = 'without' in c ? c.without : c.within;
    return Basics.isObj(inner) ? conditionProblem(inner) : 'shape';
  }
  if ('opened' in c && !(Basics.isStr(c.opened) && Check.RX.id.test(c.opened))) return 'shape';
  if ('closed' in c && !(Basics.isStr(c.closed) && Check.RX.id.test(c.closed))) return 'shape';
  if ('paid' in c && !(Basics.isStr(c.paid) && Check.RX.id.test(c.paid))) return 'shape';
  if ('stopped' in c && !(Basics.isStr(c.stopped) && Check.RX.id.test(c.stopped) && (c.side === 'from' || c.side === 'to') && Object.keys(c).every(k => k === 'stopped' || k === 'side'))) return 'shape';
  return null;
}
// the clock a block is a block of (blocks.md, A named clock): each name is a block id and names a line, that block's key's blocks after it (a person's id names
// her genesis key's line); the name, which counts once (folds.md, Counts: a count counts ids), or null.
// a clock is a line the word's signer named. `clockLine(name, pool)`: the counted blocks on the line a name names, read as it goes on. A person's id names her line, whatever key of her list signs (a wait on a clock whose owner
// changed keys is no longer stuck); a key grant that adds one key under a voice names that key's line; any other block names its key's blocks after it. A receipt counts only where its key spoke for the clock's owner at that block (`counts`).
function clockLine(name, pool) {
  pool._cl = pool._cl || new Map();
  if (pool._cl.has(name)) return pool._cl.get(name);
  const B = pool.get(name); let list = [];
  if (B) {
    if (B.type === 'actor' && B.refs.author === undefined) list = pool.all().filter(o => o.refs.author === B.hash && o.hash !== B.hash && Identity.counts(o, pool));
    else if (Check.isKeyGrant(B) && !Array.isArray(B.state.voices) && Basics.isStr(B.state.public_key_sign) && Basics.isStr(B.refs.subject)) list = pool.all().filter(o => o.refs.author === B.refs.subject && o.hash !== name && Identity.counts(o, pool) && Identity.signerKeyOf(o, pool) === B.state.public_key_sign);
    else if (Basics.isStr(B.refs.author)) { const k = Identity.signerKeyOf(B, pool); list = pool.all().filter(o => o.hash !== name && o.refs.author === B.refs.author && Identity.signerKeyOf(o, pool) === k && pool.sees(o.hash, name) && Identity.counts(o, pool)); }
  }
  pool._cl.set(name, list);
  return list;
}
// the clock a block is a block of: the name whose line holds it, or null
function clockVoice(o, ks, pool) {
  for (const n of ks.names) if (clockLine(n, pool).includes(o) || clockLine(n, pool).some(x => x.hash === o.hash)) return n;
  return null;
}
// a receipt's place on a line is its time: one receipt is before another where the other has it in its causal past; its `at` orders nothing
const placedBefore = (pool, x, y) => pool.sees(y.hash, x.hash);
const receiptsOn = (name, h, pool) => clockLine(name, pool).filter(o => o.type === 'observe' && o.state.kind === 'receipt' && Check.asList(o.refs.derives_from).includes(h));
// a cutoff, on its line, is that time's place. A cutoff whose own `at` is before its `when` closes nothing: its own date shows it early, against its own signer. A cutoff
// that states no `at` shows no date against itself, so it is read as its line places it; one whose `when` is no time closes nothing (blocks.md, The cut)
const cutoffsOn = (name, pool) => clockLine(name, pool).filter(o => o.type === 'observe' && o.state.kind === 'cutoff' && Basics.isStr(o.state.when) && Check.timeProblem(o.state.when) === null && (o.state.at === undefined || (Basics.isStr(o.state.at) && o.state.at >= o.state.when)));
// on one line, the place of a block against a stated time: 'in' (a receipt of it before a cutoff of the time), 'late' (a receipt after one), or null (the line has not shown it)
function lineVerdict(name, h, deadline, pool) {
  const cuts = cutoffsOn(name, pool).filter(c => c.state.when >= deadline), rs = receiptsOn(name, h, pool);
  // a cutoff is the time's place on its line, read whole: a receipt with no cutoff of the time before it came before the time
  if (!cuts.length) return rs.length ? 'in' : null;
  if (rs.some(r => cuts.some(c => placedBefore(pool, r, c)))) return 'in';
  if (rs.some(r => cuts.some(c => placedBefore(pool, c, r)))) return 'late';
  return null;
}
// whether an end came first for a block on a clock, the reading that keeps a thing in its signer's hand: `names` less `needed`, plus one, lines each hold
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
  for (const o of pool.all()) { if (o.type !== 'observe' || o.state.kind !== 'receipt' || !Check.asList(o.refs.derives_from).includes(target) || !Basics.isStr(o.state.at) || !Identity.counts(o, pool)) continue; const v = clockVoice(o, ks, pool); if (v !== null) voices.push([v, o.state.at]); }
  return kth(voices, ks.needed, false);
}
// a price fixed later (promises.md, Terms, `price`): null when the price is a plain number; else { fixed: false } until the price is fixed, and
// { fixed: true, price: amount } once it is. The price names a figure: an observe of kind `figure` made for the deal, with state.amount, signed by one
// of the readers `by` names, received by `deadline` on the named clock `clocks`, and inside `min` and `max` when it names them. It is fixed when
// `by.needed` different readers each signed the same figure and no other figure reached that many; a reader who signed two different figures counts for
// neither. The price is the figure, or `fraction` of it, exact. Nothing is filled in.
// a line's price fixed later (promises.md, A price fixed later): null when the line's price is no method; else { fixed: false } until fixed, then
// { fixed: true, price }. A figure counts for the line it names in state.line.
function fixingOf(line, P, pool) {
  const p = line.price;
  if (!Basics.isObj(p) || !('figure' in p)) return null;
  if (Check.figureProblems(p).length) return { fixed: false };
  const ks = Identity.clocksOf(p.clocks), by = { names: p.by.names, needed: 1 };
  const inside = (k, m, bad) => p[k] === undefined || (Deals.isAmount(p[k]) && Deals.sameKind(p[k], m) && !bad(Deals.dec(m.value), Deals.dec(p[k].value)));
  const votes = [];
  for (const o of pool.all()) {
    if (o.type !== 'observe' || o.state.kind !== p.figure || o.state.line !== line.id || !Check.asList(o.refs.for).includes(P.hash) || !Identity.counts(o, pool)) continue;
    const reader = clockVoice(o, by, pool);
    if (reader === null) continue;
    const m = o.state.amount;
    if (!Deals.isAmount(m) || Deals.fcmp(Deals.dec(m.value), Deals.F0) < 0) continue;
    if (ks === null || !inTimeByClock(o.hash, ks, pool, p.deadline) || !inside('min', m, (v, b) => Deals.fcmp(v, b) < 0) || !inside('max', m, (v, b) => Deals.fcmp(v, b) > 0)) continue;
    votes.push({ reader, key: jcs(m), m });
  }
  const uniq = votes.filter((v, i) => votes.findIndex(w => w.reader === v.reader && w.key === v.key) === i);
  const once = uniq.filter(v => uniq.filter(w => w.reader === v.reader).length === 1);
  const reached = [];
  for (const v of once) if (once.filter(w => w.key === v.key).length >= Check.panelOf(p.by, Basics.isStr).needed && !reached.some(r => r.key === v.key)) reached.push(v);
  if (reached.length !== 1) return { fixed: false };
  const m = reached[0].m;
  const total = p.fraction !== undefined ? Deals.fmul(Deals.dec(m.value), Deals.dec(p.fraction)) : Deals.dec(m.value);
  return { fixed: true, price: Deals.amtOut(total, Deals.kindOf(m)) };
}
// the blocks that decide a condition, which a clock must have dated for it to hold by a time
function deciders(c, pool) {
  if ('without' in c || 'within' in c) return deciders('without' in c ? c.without : c.within, pool);
  for (const k of ['settled', 'accepted', 'paid']) if (Basics.isStr(c[k])) return pool.all().filter(b => b.hash !== c[k] && Check.asList(b.refs.for).includes(c[k]) && !(b.type === 'observe' && (b.state.kind === 'receipt' || b.state.kind === 'cutoff'))).map(b => b.hash);
  if (Basics.isStr(c.deed)) return [c.deed];
  const kind = Basics.isStr(c.signal) ? c.signal : c.reading !== undefined && Basics.isStr(c.kind) ? c.kind : null;
  if (kind !== null) return pool.all().filter(b => b.type === 'observe' && b.state.kind === kind).map(b => b.hash);
  if ('opened' in c) return pool.all().filter(b => b.state.opening !== undefined).map(b => b.hash);
  if ('ruled' in c) return pool.all().filter(b => b.type === 'observe' && b.state.kind === 'ruling').map(b => b.hash);
  return [];
}
// a time in a condition is shown only by its clock's cutoffs, each line by its place. A line that has a cutoff of the time has spoken: it reads `yes` (the inner condition holds on what that line shows
// received before the cutoff) or `no`. On a clock, `needed` lines must show the reading that moves a thing out of its signer's hand (`within`: yes; `without`: no); the other reading takes `names` less `needed`, plus one.
function deadlineReading(c, pool) {
  const negate = 'without' in c, inner = negate ? c.without : c.within, ks = Identity.clocksOf(c.clocks);
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
// whether a condition can no longer hold, read only from the clock's own readings: for `within`, its no-reading; for `without`, the yes-reading of its inner condition. A condition that can never be shown (a bare `reading`) can no longer hold from its signing.
function conditionDead(c, blocks) {
  if (!Basics.isObj(c)) return false;
  const pool = Check.poolOf(blocks);
  if ('without' in c || 'within' in c) {
    if (conditionProblem(c)) return false;
    const r = deadlineReading(c, pool);
    return r.other >= r.narrow;
  }
  return c.reading !== undefined; // only a bare `reading` is read as never shown here ("a bench of none" is a stage-5 shape) (the text does not say; read so)
}
// the pure functions read only what the write check takes (folds.md, A pure function reads only what the write check takes): `terms_total` judges
// the terms it reads (lines, step) as an offer's and the lines chosen as an accept's; what the check refuses is junk and reads as absent
const pureJunk = (() => {
  const AT = '2026-01-01T00:00:00.000Z', id = c => c.repeat(64);
  const refused = (type, state, refs) => Check.writeFindings({ type, state, refs }).length > 0;
  const terms = (t, chosen) => {
    if (!Basics.isObj(t)) return true;
    const read = Object.fromEntries(Object.entries(t).filter(([k]) => ['lines', 'step'].includes(k)));
    let junk = refused('promise', { seq: 1, at: AT, audience: 'public', terms: read }, { author: id('1'), prev: id('1'), from: id('1') });
    if (chosen !== undefined && chosen !== null) junk = junk || refused('promise', { seq: 1, at: AT, audience: 'public', status: 'accepted', terms: { lines: chosen } }, { author: id('1'), prev: id('1'), answers: id('4'), for: id('4') });
    return junk;
  };
  return { terms };
})();
// the blocks given with `b` read among them, in place of any other of its hash: a block no node would take is no word
const readWith = (blocks, b) => new Check.Pool([...Check.poolOf(blocks).all().filter(x => x.hash !== b.hash), b]);
// ---- the schema store (core.md, section 8): every thing of kind schema among the blocks given, once per id, ids ascending. Whose signature it carries is
// never read: a schema's id says what its bytes declare (spec/schemas/README.md).
function schemasFrom(blocks) {
  if (!Array.isArray(blocks)) throw argError('held is a list of blocks');
  const store = new Map();
  for (const b of blocks) if (Basics.isObj(b) && b.type === 'thing' && Basics.isObj(b.state) && b.state.kind === 'schema' && Basics.isStr(b.hash) && b.hash !== '') store.set(b.hash, b);
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
  if (!Basics.isStr(st && st.when) || Basics.timeMs(st.when) === null) throw argError('the promise\'s state.when is a time');
  if (!terms || !Basics.isStr(terms.repeat)) throw argError('the promise\'s terms.repeat is an RRULE text');
  if (!Basics.isStr(terms.zone)) throw argError('a calendar repeat is read in terms.zone');
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
  const wkst = R.WKST === undefined ? 1 : Check.tableEntry(RR_WD, R.WKST);
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
  const f = Basics.timeMs(from), t = Basics.timeMs(to);
  if (f === null || t === null) throw argError('from and to are times');
  const start = Basics.timeMs(st.when), startWall = start + rrOffset(zone, start);
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
Object.assign(module.exports, { jcs, canonical, canonOf, cryptoError, suiteOf, hashName, hashBytes, hashStr, hashOfBlock, sha256, saltedHash, shortCode, codeMatches, B, SM2, mod, inv, ecAdd, ecMul, G, be, fromHex, sm2Z, sm2E, sm2PubFromPriv, sm2Sign, sm2Verify, sm4ecb, R128, gmul, ghash, sm4gcm, SPKI_PREFIX, keyGrammar, encGrammar, encKeyProblem, xwingKeys, xwingPublicOf, xwingDecaps, sigGrammar, passkeyGrammar, suiteOfKey, rawPoint, keypair, signBytes, EP, keySound, verifyBytes, passkeyChallenge, passkeyVerify, derToRs, passkeySignature, passkeyChallengeOf, isGenesisBlock, readsAsGenesis, headerBytes, signedBytes, signBlock, verifyBlock, ENVELOPE, suiteOfAlg, xPrivKey, xPubKey, ecdh, encPublicOf, agree, kdfHash, cipherKey, gcmSeal, gcmOpen, envKey, padSize, padPlain, seal, open, CB, MAXBI, cbHead, cbEnc, cbTokens, cbMatch, cbKind, STD_PREFIX, timePlace, TYPE_INDEX, cbOut, cborEncode, cbRead, cbIn, cborDecode, cborHeader, cborHeaderDecode, cborEncodePush, cborDecodePush, argError, pairChoice, arrivalsArg, clock, merkleLeaf, merkleNode, merkleLevels, merkleRoot, merkleProof, merkleVerify, releaseShown, conditionHolds, conditionProblem, clockLine, placedBefore, receiptsOn, cutoffsOn, endFirstOn, inTimeByClock, receivedAt, fixingOf, conditionDead, pureJunk, readWith, schemasFrom, repeatOccurrences });
