'use strict';
// FoodBlock 1.6 conformance oracle, written from the spec TEXT only (core.md, canonical.md, protocol.md, transport.md,
// protocol.json, modules/*.md, profiles/*.md, legacy/converter.md). Plain Node, built-in crypto, no dependency.
// Where the text is silent a reading is marked GUESS. Where a primitive is not in Node (SM2, SM4-GCM) it is built by hand.
const crypto = require('crypto');
const SPEC = require('path').join(__dirname, '..') + '/';
const P = require(SPEC + 'protocol.json');

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
const suiteOf = name => { const s = name === undefined || name === null ? 'std' : name; if (!['std', 'p256', 'sm'].includes(s)) throw cryptoError('unknown suite ' + s, 'unknown_suite'); return s; };
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
const mod = (x, m) => ((x % m) + m) % m;
function inv(x, m) { let [a, b, u, v] = [mod(x, m), m, 1n, 0n]; while (b) { const q = a / b;[a, b] = [b, a - q * b];[u, v] = [v, u - q * v]; } return mod(u, m); }
const ecAdd = (P1, P2) => {
  const { p, a } = SM2;
  if (!P1) return P2; if (!P2) return P1;
  if (P1[0] === P2[0] && mod(P1[1] + P2[1], p) === 0n) return null;
  const l = P1[0] === P2[0] ? mod((3n * P1[0] * P1[0] + a) * inv(2n * P1[1], p), p) : mod((P2[1] - P1[1]) * inv(P2[0] - P1[0], p), p);
  const x = mod(l * l - P1[0] - P2[0], p);
  return [x, mod(l * (P1[0] - x) - P1[1], p)];
};
function ecMul(k, Pt) { let R = null, Q = Pt; while (k > 0n) { if (k & 1n) R = ecAdd(R, Q); Q = ecAdd(Q, Q); k >>= 1n; } return R; }
const G = [SM2.gx, SM2.gy];
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
  for (;;) {
    const k = mod(fromHex(crypto.randomBytes(32).toString('hex')), SM2.n - 1n) + 1n;
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
function suiteOfKey(spki) { for (const s of ['std', 'p256', 'sm']) if (typeof spki === 'string' && keyGrammar(s).test(spki)) return s; return null; }
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
function p256Private(dHex) {
  const e = crypto.createECDH('prime256v1'); e.setPrivateKey(Buffer.from(dHex, 'hex'));
  const pt = e.getPublicKey();
  return crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: Buffer.from(dHex, 'hex').toString('base64url'), x: pt.subarray(1, 33).toString('base64url'), y: pt.subarray(33).toString('base64url') }, format: 'jwk' });
}
function signBytes(bytes, privHex, suite) {
  const s = suiteOf(suite);
  if (s === 'std') return crypto.sign(null, bytes, crypto.createPrivateKey({ key: Buffer.from(privHex, 'hex'), format: 'der', type: 'pkcs8' })).toString('hex');
  if (s === 'p256') return crypto.sign('sha256', bytes, { key: p256Private(privHex), dsaEncoding: 'ieee-p1363' }).toString('hex');
  return sm2Sign(bytes, privHex);
}
function verifyBytes(bytes, sigHex, pubSpkiHex, suite) {
  try {
    const s = suite ? suiteOf(suite) : suiteOfKey(pubSpkiHex);
    if (!s || !keyGrammar(s).test(pubSpkiHex)) return false;
    if (s === 'p256' && passkeyGrammar().test(sigHex)) return passkeyVerify(bytes, Buffer.from(sigHex, 'hex'), pubSpkiHex);
    if (!sigGrammar(s).test(sigHex)) return false;
    const sig = Buffer.from(sigHex, 'hex');
    if (s === 'std') return crypto.verify(null, bytes, crypto.createPublicKey({ key: Buffer.from(pubSpkiHex, 'hex'), format: 'der', type: 'spki' }), sig);
    if (s === 'p256') return crypto.verify('sha256', bytes, { key: crypto.createPublicKey({ key: Buffer.from(pubSpkiHex, 'hex'), format: 'der', type: 'spki' }), dsaEncoding: 'ieee-p1363' }, sig);
    return sm2Verify(bytes, rawPoint(pubSpkiHex), sigHex);
  } catch { return false; }
}
// ---- passkeys (modules/passkeys.md): a WebAuthn assertion as a p256 signature
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
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(cdj); data = JSON.parse(text); } catch { return false; }
  if (data === null || typeof data !== 'object' || Array.isArray(data) || hasRepeatedKey(text)) return false;
  if (data.type !== 'webauthn.get' || data.challenge !== passkeyChallenge(bytes)) return false;
  const signed = Buffer.concat([auth, crypto.createHash('sha256').update(cdj).digest()]);
  return crypto.verify('sha256', signed, { key: crypto.createPublicKey({ key: Buffer.from(pubSpkiHex, 'hex'), format: 'der', type: 'spki' }), dsaEncoding: 'ieee-p1363' }, sig.subarray(0, 64));
}
// The WebAuthn signature may be DER; the passkey signature is r||s.
function derToRs(der) {
  let i = 2; if (der[1] & 0x80) i += der[1] & 0x7f;
  const out = Buffer.alloc(64);
  for (const at of [0, 32]) { const len = der[i + 1]; let v = der.subarray(i + 2, i + 2 + len); while (v.length > 32 && v[0] === 0) v = v.subarray(1); v.copy(out, at + 32 - v.length); i += 2 + len; }
  return out;
}
function passkeySignature(authHex, cdjHex, sigHex) {
  const sig = Buffer.from(sigHex, 'hex'), rs = sig.length === 64 ? sig : derToRs(sig), auth = Buffer.from(authHex, 'hex');
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
// GUESS: SM4 takes a 16-byte key; the text says only "a 32-byte key" for every suite, so SM4 uses the first 16 bytes.
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
const KNOWN_HASH_PREFIX = ['sm3:']; // GUESS: the hashes table also names sha3-256, but the text says that suite is "not usable"; only sm3: is read.
const CLOSED = new Set(P.closed_types);
const SHARED_REFS = new Set([...P.refs.who_and_where, ...P.refs.what_and_which, ...P.verbs, ...P.causal]);
const POWERS = new Set([...P.powers, 'rekey']); // rekey is the power of profiles/rekeys.md
const STATUSES = new Set(P.statuses);
const FIELDS_EVERY = new Set(P.fields.every);
const PROFILE_FIELDS = { every: ['proof', 'assisted_by', 'stays_in'], grant: ['witnesses', 'needed', 'wait', 'keys', 'answer_within', 'marks', 'epoch'] };
// GUESS: the grant kinds profiles add (successor, recall) are not "grants others act under", so they carry no scope.until; the text names no rule for them.
const PROFILE_GRANT_KINDS = new Set(['successor', 'recall']);
const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const isStr = x => typeof x === 'string';
const dim = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
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
  if (!isObj(m) || Object.keys(m).some(k => !P.shapes.money.includes(k)) || !Number.isInteger(m.minor)) return 'shape';
  return currencyProblem(m.currency);
}
const has = (o, ...ks) => ks.every(k => k in o);
// An amount { value, unit }, a price (money, money per unit { money, per }, or a share { share, of }) and a quantity (an amount, or a range { min, max }
// only under a per-unit price) at the places a promise's terms and lines name them (promises.md, Terms). Each returns a code, or null.
const amountProblem = a => {
  if (a === undefined) return null;
  if (!isObj(a) || Object.keys(a).some(k => !P.shapes.amount.includes(k)) || !isStr(a.value) || !isStr(a.unit) || a.unit === '') return 'shape';
  return RX.decimal.test(a.value) ? null : 'decimal';
};
const perUnit = p => isObj(p) && 'per' in p;
function priceProblems(p) {
  const out = [];
  if (p === undefined) return out;
  if (perUnit(p)) {
    if (Object.keys(p).some(k => !P.shapes.price_per.includes(k))) out.push('shape');
    if (p.money === undefined) out.push('shape'); else { const c = moneyProblem(p.money); if (c) out.push(c); }
    const c = amountProblem(p.per); if (c) out.push(c);
    return out;
  }
  if (isObj(p) && p.share !== undefined) {
    if (Object.keys(p).some(k => !P.shapes.price_share.includes(k)) || !isStr(p.share) || idProblem(p.of)) return ['shape'];
    return RX.decimal.test(p.share) ? [] : ['decimal'];
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
  if (q.min && q.max && q.min.unit === q.max.unit && Number(q.min.value) > Number(q.max.value)) out.push('shape');
  return out;
}
// Shapes are read at the places protocol.json gives them (shapes.places), never by a field name deeper in. A value at a place is read by
// its own keys; a composite shape's parts (a price's money and per, a range's ends, an area's radius) are read as the shape says.
function shapeValue(v, out, key) {
  if (Array.isArray(v)) { v.forEach(x => shapeValue(x, out, key)); return; }
  if (!isObj(v)) return;
  const bad = c => c && out.push({ code: c, detail: 'shape at ' + key });
  const within = ks => Object.keys(v).every(k => ks.includes(k));
  // a value is money when it has `minor` and nothing outside { minor, currency }; an amount when it has `unit` and nothing outside { value, unit }
  if ('minor' in v && within(P.shapes.money)) bad(moneyProblem(v));
  else if (has(v, 'issuer', 'unit', 'decimals')) bad(currencyProblem(v));
  if ('unit' in v && within(P.shapes.amount)) bad(amountProblem(v)); // the structure first: a value that is not a decimal is only read once the amount has its two keys
  else if (has(v, 'scheme', 'value')) { if (!isStr(v.scheme) || !isStr(v.value)) bad('shape'); }
  if (has(v, 'money', 'per') && isObj(v.per)) { bad(moneyProblem(v.money)); if (!has(v.per, 'value', 'unit')) bad('shape'); }
  if (has(v, 'share', 'of')) { if (!isStr(v.share) || !RX.decimal.test(v.share)) bad('decimal'); bad(idProblem(v.of) && 'grammar'); }
  else if (has(v, 'from', 'share')) { if (!isStr(v.share) || !RX.decimal.test(v.share)) bad('decimal'); bad(idProblem(v.from) && 'grammar'); }
  if (has(v, 'lat', 'lon')) { for (const k of ['lat', 'lon']) if (!isStr(v[k]) || !RX.decimal.test(v[k])) bad('shape'); if ('radius' in v && !(isObj(v.radius) && has(v.radius, 'value', 'unit'))) bad('shape'); }
  const composite = (has(v, 'money', 'per')) || (has(v, 'min', 'max')) || ('radius' in v);
  if (composite) for (const part of ['money', 'per', 'min', 'max', 'radius']) if (part in v) {
    if (part === 'money' && !isObj(v[part])) bad('shape');
    shapeValue(v[part], out, key + '.' + part);
  }
}
function shapeFindings(container, out, key) {
  if (!isObj(container)) return;
  const pl = P.shapes.places;
  for (const [k, x] of Object.entries(container)) {
    if (pl.bare.includes(k) && !isObj(x)) out.push({ code: 'shape', detail: 'shape at ' + key + '.' + k });
    shapeValue(x, out, key + '.' + k);
    if (pl.containers.includes(k)) shapeFindings(x, out, key + '.' + k);
    else if (pl.lists.includes(k) && Array.isArray(x)) x.forEach(i => shapeFindings(i, out, key + '.' + k));
  }
}

function contentFindings(b, ctx) {
  const out = [];
  const add = (stage, code, detail) => out.push({ stage, code, detail: detail || '' });
  const held = ctx.held;
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
      if (!Number.isInteger(v)) add(2, 'float', path.join('.'));
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
  for (const k of ['prev', 'author']) if (isObj(refs) && Array.isArray(refs[k])) add(2, 'grammar', 'refs.' + k + ' is one id'); // core.md section 5: author is the identity's id, prev names the key's previous block
  for (const [k, v] of Object.entries(refs)) for (const id of asList(v)) { const p = idProblem(id); if (p) add(2, p, 'refs.' + k); }
  const timeAt = (o, where) => {
    if (!isObj(o)) return;
    for (const f of P.time_fields) if (f in o) {
      const v = o[f];
      if (f === 'when' && isObj(v)) {
        if (has(v, 'after')) { const p = idProblem(v.after); if (p) add(2, p, 'when.after'); if ('wait' in v) { const q = durationProblem(v.wait); if (q) add(2, q, 'when.wait'); } }
        for (const e of ['from', 'to']) if (e in v) { const q = timeProblem(v[e]); if (q) add(2, q, 'when.' + e); }
      } else { const q = timeProblem(v); if (q) add(2, q, where + '.' + f); }
    }
    for (const f of P.date_fields) if (f in o) { const q = dateProblem(o[f]); if (q) add(2, q, where + '.' + f); }
    for (const f of P.duration_fields) if (f in o && !(f === 'per' && isObj(o[f]))) { const q = durationProblem(o[f]); if (q) add(2, q, where + '.' + f); }
  };
  timeAt(state, 'state'); timeAt(state.terms, 'terms'); timeAt(state.scope, 'scope');
  if (isObj(state.when)) timeAt({ when: state.when }, 'state');
  if (isObj(state.terms)) for (const l of asList(state.terms.lines)) timeAt(l, 'line');
  for (const flag of ['skip', 'withheld']) if (flag in state && state[flag] !== true) add(2, 'shape', 'state.' + flag + ' is true, or left out');
  for (const k of ['line', 'channel']) if (k in state && !isStr(state[k])) add(2, 'shape', 'state.' + k + ' is text');
  if ('confidence' in state && (!isStr(state.confidence) || !RX.confidence.test(state.confidence))) add(2, 'grammar', 'confidence');
  if ('lang' in state && (!isStr(state.lang) || !RX.lang.test(state.lang))) add(2, 'grammar', 'lang');
  if ('nonce' in state && (!isStr(state.nonce) || !RX.nonce.test(state.nonce))) add(2, 'grammar', 'nonce');
  for (const f of ['counted_to', 'custodian', 'recovery_key_hash', 'assisted_by']) if (f in state) { const p = idProblem(state[f]); if (p) add(2, p, f); }
  for (const f of ['parties']) if (f in state) for (const id of asList(state[f])) { const p = idProblem(id); if (p) add(2, p, f); }
  if (isObj(state.terms) && 'settled_by' in state.terms) { const p = idProblem(state.terms.settled_by); if (p) add(2, p, 'settled_by'); }
  // suites and keys
  for (const f of ['suite', 'recovery_suite']) if (f in state && !['std', 'p256', 'sm'].includes(state[f])) add(2, 'unknown_suite', f);
  const ks = ['std', 'p256', 'sm'].includes(state.suite) ? state.suite : 'std';
  if ('public_key_sign' in state && !(isStr(state.public_key_sign) && keyGrammar(ks).test(state.public_key_sign))) add(2, 'unknown_suite', 'public_key_sign');
  for (const f of ['replaces', 'recovery_key', 'orderer']) if (f in state && suiteOfKey(state[f]) === null) add(2, 'unknown_suite', f);
  if ('public_key_encrypt' in state && !(isStr(state.public_key_encrypt) && encGrammar(ks).test(state.public_key_encrypt))) add(2, 'unknown_suite', 'public_key_encrypt');
  { const found = []; shapeFindings(state, found, 'state'); found.forEach(x => add(2, x.code, x.detail)); }
  // the codes of one check come in the order protocol.json lists them (core.md section 8)
  { const ord = Object.keys(P.refusals.codes.block); out.sort((x, y) => x.stage - y.stage || ord.indexOf(x.code) - ord.indexOf(y.code)); }
  if (out.some(o => o.stage <= 2)) return out;
  // ---- stage 3: size
  if (Buffer.byteLength(canonical(type, state, refs), 'utf8') > P.limits.block_bytes) add(3, 'size_limit', 'over ' + P.limits.block_bytes);
  if (asList(refs.after).length > P.limits.after_heads) add(3, 'after_limit', 'after names more than ' + P.limits.after_heads);
  if (out.length) return out;
  // ---- stage 4: genesis, or the common five
  const isActor = type === 'actor';
  // a genesis is the one actor with no author, or one that names a signing key (core.md section 4: a key comes in by a key grant); any other actor is an ordinary block
  const genesis = isActor && (refs.author === undefined || 'public_key_sign' in state);
  if (genesis) {
    const bad = [];
    if (refs.author !== undefined || refs.prev !== undefined || refs.after !== undefined || state.seq !== undefined) bad.push('has author, prev, after or seq');
    if (state.audience !== 'public') bad.push('not public');
    for (const f of P.genesis.required) if (!(f in state) || (f !== 'audience' && (!isStr(state[f]) || state[f] === ''))) bad.push('missing ' + f);
    if (('recovery_key_hash' in state) !== ('recovery_reach' in state)) bad.push('only one of the recovery fields');
    const allowed = new Set([...P.genesis.required, ...P.genesis.optional, 'name', 'marks', 'lang']);
    for (const k of Object.keys(state)) if (!allowed.has(k)) bad.push('field ' + k);
    for (const k of Object.keys(refs)) bad.push('ref ' + k);
    if (bad.length) add(4, 'bad_genesis', bad.join('; '));
  } else {
    for (const f of ['author', 'prev']) if (refs[f] === undefined) add(4, 'chain', 'no refs.' + f);
    if (!Number.isInteger(state.seq) || state.seq < 1) add(4, 'chain', 'no state.seq');
    if (state.audience === undefined) add(4, 'chain', 'no state.audience');
    else {
      const a = state.audience;
      if (a !== 'public') {
        if (!Array.isArray(a) || !a.length || !a.every(isStr) || a.some(x => idProblem(x)) || a.some((x, i) => i && !(a[i - 1] < x))) add(4, 'audience', 'neither public nor a sorted list of commitments');
        else if (!('nonce' in state)) add(4, 'audience', 'a private block carries a nonce'); // GUESS: the text gives the nonce to private blocks but names no code for its absence
      }
    }
    if (state.at === undefined && !['observe', 'transform', 'transfer'].includes(type)) add(4, 'at_missing', type);
  }
  if (out.length) return out;
  // ---- stage 7: closed types and their modules (stages 5 and 6 need keys and a chain: valid())
  if (CLOSED.has(type) && !genesis && !ctx.noClosed) closedFindings(b, ctx, add);
  return out;
}

function schemaOf(refs, held) { return refs.schema && held.get(refs.schema); }
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
        const recoveryPair = 'recovery_key_hash' in state && 'recovery_reach' in state;
        req('public_key_sign' in state || 'public_key_encrypt' in state || recoveryPair, 'a key grant names a key');
        if ('replaces' in state) { req('counted_to' in state, 'a rotation names counted_to'); req('public_key_sign' in state, 'a rotation names the new key'); }
        if ('recovery_key_hash' in state !== 'recovery_reach' in state) req(false, 'recovery fields come together');
      }
      if (state.kind === 'member') {
        req(refs.subject !== undefined, 'member grant subject'); req(refs.as !== undefined && refs.as === refs.subject, 'member grant is signed as the circle');
        if ('roles' in state && !(Array.isArray(state.roles) && state.roles.every(r => isStr(r) && r !== ''))) add(A, 'shape', 'state.roles lists the role names it gives (text)');
      }
      if (state.kind === 'operator') req(refs.to !== undefined, 'operator grant names the agent in refs.to');
    }
  }
  if (type === 'transfer' && !asAnswer) {
    req(refs.what !== undefined || state.money !== undefined, 'transfer what'); // GUESS: core.md section 7 requires refs.what, but things.md moves money with no refs.what; money is exempt
    req(['to_owner', 'to_holder', 'to_place'].some(k => refs[k] !== undefined) || state.count !== undefined, 'transfer moves something');
  }
  if (type === 'promise' && !asAnswer && !counter) req(refs.what !== undefined || state.what !== undefined, 'promise what');
  // undeclared
  const schema = schemaOf(refs, held);
  if (!(refs.schema && !schema) && !schema) {
    const allowed = new Set([...FIELDS_EVERY, ...PROFILE_FIELDS.every, ...(P.fields[type] || []), ...(PROFILE_FIELDS[type] || [])]);
    for (const k of Object.keys(state)) if (!allowed.has(k)) add(A, 'undeclared_field', k);
    for (const k of Object.keys(refs)) if (!SHARED_REFS.has(k)) add(A, 'undeclared_ref', k);
  } else if (refs.schema && !schema) {
    // GUESS: a block that names a schema the checker does not hold is not judged on fields the schema may declare
  }
  // module checks
  if (type === 'actor' && (state.kind === 'circle' || 'roles' in state)) {
    const roles = state.roles;
    const ok = Array.isArray(roles) && roles.length > 0 && roles.every(r => isObj(r) && Object.keys(r).every(k => k === 'name' || k === 'powers') && isStr(r.name) && r.name && Array.isArray(r.powers) && r.powers.every(p => POWERS.has(p)));
    if (!ok) add(A, 'bad_roles', 'a circle lists roles [{ name, powers }] and the founder holds the first');
  }
  if (['promise', 'grant', 'transfer'].includes(type)) { // a status goes with an answer or the author's own stop; a stop goes with status stopped
    const stopOk = x => x === 'before' || x === 'onward' || (isObj(x) && Array.isArray(x.occurrences));
    if (state.status === undefined) { if ('stop' in state) add(A, 'bad_status', 'state.stop goes with status stopped'); }
    else {
      if (!answer && refs.updates === undefined) add(A, 'status_not_answer', 'status on a block that neither answers nor updates');
      if (!STATUSES.has(state.status)) add(A, 'bad_status', String(state.status));
      if (state.status === 'stopped') { if (!stopOk(state.stop)) add(A, 'bad_status', 'state.stop'); }
      else if ('stop' in state) add(A, 'bad_status', 'state.stop goes with status stopped');
    }
  }
  if (type === 'promise') {
    if (answer) {
      if (refs.for === undefined) add(A, 'deal_not_named', 'an answer or counter names the first promise in refs.for');
      else {
        const target = held.get(refs.answers);
        if (target) { const first = target.refs.answers === undefined ? target.hash : target.refs.for; if (first !== undefined && refs.for !== first) add(A, 'deal_not_named', 'refs.for is not the first promise'); }
      }
    }
    // sides: who signs for a side is its author, the circle it signs as, or the grantor of the grant it acts under (that grant's author, or the circle it was signed as).
    // With the grant not held (a write check with no context) the sides cannot be judged.
    const grantHeld = refs.under === undefined ? null : (isStr(refs.under) ? held.get(refs.under) : null);
    const principals = refs.under === undefined ? [] : grantHeld ? [grantHeld.refs.author, grantHeld.refs.as] : null;
    const speaksFor = x => x !== undefined && x !== null && (x === refs.author || x === refs.as || (principals || []).includes(x));
    // a side that names a thing it holds is judged by the fold, not here: who owns the thing is not a block this one needs (promises.md, Bearer)
    const speaks = x => speaksFor(x) || (isStr(x) && !!held.get(x) && held.get(x).type === 'thing');
    if (principals) {
      if (answer) {
        const target = held.get(refs.answers);
        if (target && target.type === 'promise') {
          const sides = [target.refs.from, target.refs.to];
          if (sides.every(x => x !== undefined) && !sides.some(speaks)) add(A, 'not_a_side', 'signed by neither side of the deal');
        }
      } else if (update) {
        const target = held.get(refs.updates);
        if (target && target.type === 'promise' && (target.refs.from !== undefined || target.refs.to !== undefined) && ![target.refs.from, target.refs.to].some(speaks)) add(A, 'not_a_side', 'signed by neither side'); // an allocation has no sides of its own: its author stops it
      } else {
        if (![refs.from, refs.to].some(speaks)) add(A, 'not_a_side', 'signed by neither side');
      }
    }
    if (!update && !answer) {
      const ask = speaks(refs.to) && !speaks(refs.from);
      if (ask && !(isObj(state.terms) && state.terms.expires !== undefined)) add(A, 'ask_without_expires', 'every ask carries terms.expires');
    }
    if ('what' in state && !(isStr(state.what) || isObj(state.what))) add(A, 'shape', 'state.what describes time or a job (text, or data under a schema)');
    if ('terms' in state && !isObj(state.terms)) add(A, 'shape', 'state.terms is { price, quantity, lines, ... }');
    const terms = isObj(state.terms) ? state.terms : {};
    // terms is { price, quantity, lines, ... } and nothing else (protocol.json terms); a line is { id, what, quantity, price }
    for (const k of Object.keys(terms)) if (!P.terms.includes(k)) add(A, 'undeclared_field', 'terms.' + k);
    if (Array.isArray(terms.lines)) for (const l of terms.lines) if (!isObj(l) || Object.keys(l).some(k => !P.line.includes(k))) add(A, 'lines', 'a line is { id, what, quantity, price }');
    for (const c of [...priceProblems(terms.price), ...quantityProblems(terms.quantity, terms.price)]) add(A, c, 'terms price or quantity');
    if (Array.isArray(terms.lines)) for (const l of terms.lines) if (isObj(l)) for (const c of [...priceProblems(l.price), ...quantityProblems(l.quantity, l.price)]) add(A, c, 'line price or quantity');
    if (Array.isArray(terms.lines)) {
      const ids = terms.lines.map(l => isObj(l) ? l.id : undefined);
      if (ids.some(i => !isStr(i)) || new Set(ids).size !== ids.length) add(A, 'lines', 'a line has an id unique in the promise');
      else if (terms.price !== undefined || terms.quantity !== undefined) add(A, 'lines', 'lines and a top-level price or quantity');
      else { const w = [...new Set(terms.lines.map(l => l.what))].sort(), r = [...new Set(asList(refs.what))].sort(); if (jcs(w) !== jcs(r)) add(A, 'lines', 'refs.what is not the set of the lines\' what'); }
    }
  }
  if (type === 'grant' && isStr(state.kind) && state.kind !== '' && !asAnswer) {
    const scope = isObj(state.scope) ? state.scope : null;
    if (scope) for (const k of Object.keys(scope)) if (!P.scope.includes(k)) add(A, 'undeclared_field', 'scope.' + k);
    const readByProtocol = ['key', 'member', 'operator'].includes(state.kind);
    if (readByProtocol) { if (scope && scope.until !== undefined) add(A, 'scope_until', state.kind + ' grants carry no scope.until'); }
    else if (!PROFILE_GRANT_KINDS.has(state.kind) && !(scope && scope.until !== undefined)) add(A, 'scope_until', 'a grant others act under carries scope.until');
    if (refs.parent !== undefined) {
      const parent = held.get(refs.parent);
      if (parent) {
        if (parent.refs.to !== refs.author) add(A, 'not_receiver', 'passed on by someone other than the receiver');
        else if (!scopeWithin(state, parent.state)) add(A, 'wider_than_parent', 'wider than the parent');
      }
    }
  }
}

// ---- scope subset rules (authority.md): a child's scope is a subset of its parent's on every field.
// Durations are compared by adding both to the same instant, the parent grant's at.
function parseDur(s) {
  const m = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(s);
  if (!m) return null;
  const n = m.slice(1).map(x => +(x || 0));
  return { Y: n[0], M: n[1], W: n[2], D: n[3], h: n[4], m: n[5], s: n[6] };
}
function addDur(iso, dur, sign = 1) { // calendar months and years in UTC, then days and time
  const p = parseDur(dur), d = new Date(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCFullYear(d.getUTCFullYear() + sign * p.Y, d.getUTCMonth() + sign * p.M);
  d.setUTCDate(Math.min(day, dim(d.getUTCFullYear(), d.getUTCMonth() + 1))); // GUESS: a month end is clamped to the last day of the month
  return new Date(d.getTime() + sign * (((p.W * 7 + p.D) * 24 + p.h) * 3600 + p.m * 60 + p.s) * 1000).toISOString();
}
const subsetOf = (a, b) => asList(a).every(x => asList(b).some(y => jcs(x) === jcs(y)));
function scopeWithin(child, parent) {
  const c = isObj(child.scope) ? child.scope : {}, p = isObj(parent.scope) ? parent.scope : {};
  for (const f of ['acts', 'parties']) {
    if (p[f] === undefined) continue;
    if (c[f] === undefined || !subsetOf(c[f], p[f])) return false;
  }
  if (p.limit !== undefined) {
    if (c.limit === undefined) return false;
    if (jcs(c.limit.currency) !== jcs(p.limit.currency) || c.limit.minor > p.limit.minor) return false;
  }
  const at = parent.at || child.at;
  if (p.per !== undefined) {
    if (c.per === undefined) { if (c.limit !== undefined) return false; }
    else if (at && addDur(at, c.per) > addDur(at, p.per)) return false;
  }
  if (p.until !== undefined && (c.until === undefined || c.until > p.until)) return false;
  const pd = parent.depth === undefined ? 0 : parent.depth, cd = child.depth === undefined ? 0 : child.depth;
  if (pd < 1 || !(cd <= pd - 1)) return false;
  if (p.notice !== undefined) { if (c.notice === undefined) return false; if (at && addDur(at, c.notice) < addDur(at, p.notice)) return false; }
  if (p.condition !== undefined) {
    if (c.condition === undefined) return false;
    if (isObj(p.condition) && isObj(c.condition)) { if (!Object.entries(p.condition).every(([k, v]) => jcs(c.condition[k]) === jcs(v))) return false; }
    else if (!subsetOf(p.condition, c.condition)) return false;
  }
  return true;
}

// ---- the check as the door gives it
function check(block, held) {
  const ctx = { held: normHeld(held) };
  const found = contentFindings(block, ctx);
  if (!found.length) return [];
  const stage = Math.min(...found.map(f => f.stage));
  const seen = new Set(), list = [];
  for (const f of found.filter(f => f.stage === stage)) { if (!seen.has(f.code)) { seen.add(f.code); list.push({ code: f.code, detail: f.detail }); } }
  return list;
}
const refusals = (type, state, refs, held) => check({ type, state, refs }, held);

// strict_text: a block as TEXT. Duplicate keys and number tokens are visible only here.
function strictText(text) {
  let i = 0; const extra = [];
  const ws = () => { while (/\s/.test(text[i])) i++; };
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
        o[k] = value(); ws();
        if (text[i] === ',') { i++; continue; } if (text[i] === '}') { i++; return o; } fail();
      }
    }
    if (c === '[') { i++; const a = []; ws(); if (text[i] === ']') { i++; return a; } for (;;) { a.push(value()); ws(); if (text[i] === ',') { i++; continue; } if (text[i] === ']') { i++; return a; } fail(); } }
    if (c === '"') return str();
    const m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i));
    if (m) {
      i += m[0].length;
      if (m[1] || m[2]) return 0.5; // a number with a fraction or exponent: a float, whatever its value
      if (m[0] === '-0') return -0;
      return Number(m[0]);
    }
    for (const [w, v] of [['true', true], ['false', false], ['null', null]]) if (text.startsWith(w, i)) { i += w.length; return v; }
    fail();
  }
  function str() { if (text[i] !== '"') fail(); let j = i + 1; while (text[j] !== '"') { if (text[j] === '\\') j++; j++; } const s = JSON.parse(text.slice(i, j + 1)); i = j + 1; return s; }
  let b;
  try { b = value(); ws(); if (i !== text.length) fail(); } catch { return [{ code: 'not_canonical', detail: 'not JSON' }]; }
  const found = [...extra, ...contentFindings(b, { held: new Map() })];
  if (!found.length) return [];
  const stage = Math.min(...found.map(f => f.stage)), seen = new Set(), list = [];
  for (const f of found.filter(f => f.stage === stage)) if (!seen.has(f.code)) { seen.add(f.code); list.push({ code: f.code, detail: f.detail }); }
  return list.sort((a, b) => CODE_ORDER.indexOf(a.code) - CODE_ORDER.indexOf(b.code));
}

// ================================================================ blocks held, causal past (blocks.md)
// A block's causes: every block it names in refs, and the block it counts to (protocol.json causal_state).
const refIds = b => { const out = []; for (const v of Object.values(b.refs || {})) for (const x of asList(v)) if (isStr(x)) out.push(x); for (const k of P.causal_state) if (b.state && isStr(b.state[k])) out.push(b.state[k]); return out; };
// What a block rests on (protocol.json needs): its prev and, by type, the grant it passes on, the offer it answers or stops, the grant it acts under,
// the block it counts to. A block waits until all are held, and a fold reads only blocks whose needs are all in its input.
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
class Pool {
  constructor(blocks, open) { this.m = new Map(); for (const b of blocks || []) if (b && b.hash && isObj(b.state) && isObj(b.refs)) this.m.set(b.hash, b); /* a block whose state or refs is not an object is not read */ if (!open) closeMap(this.m); this.memo = new Map(); this.folds = new Map(); }
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
}
const poolOf = x => x instanceof Pool ? x : new Pool(x);
const blockOnly = b => { const o = {}; for (const k of ['type', 'state', 'refs']) if (k in b) o[k] = b[k]; return o; };

// ================================================================ the identity fold (identity.md)
// Output: signed_by_author { hash: bool }, keys, frozen (sorted), operators, plus the working data valid() needs.
const isKeyGrant = b => b.type === 'grant' && b.state && b.state.kind === 'key';
function emptyIdentity() { return { signed_by_author: {}, keys: [], frozen: [], operators: [], info: new Map(), cutoff: {}, keyMap: new Map(), ended: false, timeline: [] }; }
function identityFold(id, poolIn, visiting) {
  const pool = poolOf(poolIn);
  if (pool.folds.has(id)) return pool.folds.get(id);
  visiting = visiting || new Set();
  if (visiting.has(id)) return emptyIdentity();
  visiting.add(id);
  const res = computeIdentity(id, pool, visiting);
  visiting.delete(id);
  pool.folds.set(id, res);
  return res;
}
function computeIdentity(id, pool, visiting) {
  const g = pool.get(id);
  if (!g || g.type !== 'actor' || g.refs.author !== undefined || !isStr(g.state.public_key_sign)) return emptyIdentity();
  const genKey = g.state.public_key_sign;
  const idSuite = g.state.suite || 'std';
  const all = pool.all();
  const authored = all.filter(b => b.refs.author === id && b.hash !== id);
  const grantsFor = all.filter(b => isKeyGrant(b) && b.refs.subject === id);
  const opCandidates = grantsFor.filter(b => b.refs.author !== id);
  const claim = new Set([genKey]);
  for (const b of grantsFor) if (isStr(b.state.public_key_sign)) claim.add(b.state.public_key_sign);
  // the recovery key hash: the genesis's, else the one a key grant of the identity names with its reach
  let rh = g.state.recovery_key_hash;
  if (rh === undefined) for (const b of authored) if (isKeyGrant(b) && b.state.recovery_key_hash !== undefined && b.state.recovery_reach !== undefined) { rh = b.state.recovery_key_hash; break; }
  const recoveryOk = rk => isStr(rk) && rh !== undefined && recoveryKeyHash(rk, idSuite) === rh;
  const info = new Map();
  for (const b of authored) {
    if (b.state.recovery_key !== undefined && recoveryOk(b.state.recovery_key) && verifyBlock(b, b.signature, b.state.recovery_key)) { info.set(b.hash, { key: b.state.recovery_key, role: 'recovery' }); continue; }
    for (const k of claim) if (verifyBlock(b, b.signature, k)) { info.set(b.hash, { key: k, role: 'key' }); break; }
  }
  const order = [...authored, ...opCandidates].sort((a, b) => pool.past(a.hash).size - pool.past(b.hash).size || (a.state.seq || 0) - (b.state.seq || 0) || (a.hash < b.hash ? -1 : 1));
  const posOf = b => b.hash === id ? 0 : (b.state.seq === undefined ? 0 : b.state.seq);
  // position of counted_to in the replaced key's chain (a rotation's counted_to is held: it is one of the blocks the rotation rests on). A block that is not of that key places at 0.
  const countedPos = (R, ct) => {
    if (ct === id) return 0;
    const c = pool.get(ct), ci = c && info.get(c.hash);
    return ci && ci.key === R ? posOf(c) : 0;
  };
  const isAgentLike = ['agent', 'machine'].includes(g.state.kind);
  const opAuthorized = b => {
    if (!isAgentLike || visiting.has(b.refs.author)) return false;
    const O = b.refs.author;
    if (!operatorsOf(id, pool, visiting).includes(O)) return false;
    const of = identityFold(O, pool, visiting);
    return of.signed_by_author[b.hash] === true;
  };
  // one pass: which blocks count, given cutoffs and frozen keys assumed
  const pass = (cutoff, frozen) => {
    const keys = new Map([[genKey, { via: null }]]), counting = new Set([id]), brings = new Map(), rotations = [];
    for (const b of order) {
      const inf = info.get(b.hash);
      let ok = false, permitted = true, role;
      if (b.refs.author !== id) { // the operator route
        if (isKeyGrant(b) && opAuthorized(b)) { ok = true; role = 'operator'; } else continue;
      } else if (!inf) continue;
      else if (inf.role === 'recovery') { ok = true; role = 'recovery'; }
      else {
        role = 'key';
        const X = inf.key;
        if (keys.has(X) && !frozen.has(X)) {
          const self = isKeyGrant(b) && b.state.replaces === X;
          ok = self || cutoff[X] === undefined || posOf(b) <= cutoff[X];
        }
      }
      if (!ok) continue;
      if (isKeyGrant(b) && b.state.replaces !== undefined) {
        const R = b.state.replaces;
        permitted = role === 'recovery' || role === 'operator' || (info.get(b.hash) && info.get(b.hash).key === R);
        if (b.refs.author === id) counting.add(b.hash);
        if (!permitted) continue;
        rotations.push({ b, R, role, ct: countedPos(R, b.state.counted_to) });
      } else if (b.refs.author === id) counting.add(b.hash);
      if (isKeyGrant(b) && isStr(b.state.public_key_sign) && permitted) { if (!keys.has(b.state.public_key_sign)) keys.set(b.state.public_key_sign, { via: b }); brings.set(b.hash, b.state.public_key_sign); }
    }
    return { keys, counting, brings, rotations };
  };
  let cutoff = {}, frozen = new Set(), ended = false, st;
  const unrelated = (a, b) => !pool.sees(a.hash, b.hash) && !pool.sees(b.hash, a.hash);
  for (let it = 0; it < 16; it++) {
    st = pass(cutoff, frozen);
    const nc = {}, nf = new Set();
    const byR = new Map();
    for (const r of st.rotations) { if (!byR.has(r.R)) byR.set(r.R, []); byR.get(r.R).push(r); }
    for (const [R, list] of byR) {
      const rec = list.filter(r => r.role === 'recovery');
      nc[R] = rec.length ? Math.min(...rec.map(r => r.ct)) : Math.min(...list.map(r => r.ct)); // GUESS: with a recovery rotation, its counted_to decides
    }
    // conflicts: two counting key grants of one key naming one prev, or two rotations of one key that do not see each other
    const grants = order.filter(b => isKeyGrant(b) && st.counting.has(b.hash));
    const pairs = [];
    for (let i = 0; i < grants.length; i++) for (let j = i + 1; j < grants.length; j++) {
      const a = grants[i], c = grants[j], ia = info.get(a.hash), ic = info.get(c.hash);
      const forkPair = ia && ic && ia.key === ic.key && a.refs.prev === c.refs.prev;
      const rotPair = a.state.replaces !== undefined && a.state.replaces === c.state.replaces && unrelated(a, c) && st.rotations.some(r => r.b === a) && st.rotations.some(r => r.b === c);
      if (forkPair || rotPair) pairs.push([a, c, rotPair ? a.state.replaces : ia.key]);
    }
    const rrots = st.rotations.filter(r => r.role === 'recovery');
    ended = false;
    for (let i = 0; i < rrots.length; i++) for (let j = i + 1; j < rrots.length; j++) if (unrelated(rrots[i].b, rrots[j].b)) ended = true;
    for (const [a, c, R] of pairs) {
      const rr = rrots.filter(r => r.R === R);
      for (const m of [a, c]) {
        const S = m.state.public_key_sign;
        if (!isStr(S)) continue;
        const settled = rr.some(r => pool.sees(r.b.hash, m.hash) || r.b.state.counted_to === m.hash);
        if (!settled) nf.add(S);
      }
      if (a.state.replaces !== undefined && c.state.replaces !== undefined) nc[R] = Math.min(nc[R] === undefined ? Infinity : nc[R], countedPos(R, a.state.counted_to), countedPos(R, c.state.counted_to));
      if (rr.length) nc[R] = Math.min(...rr.map(r => r.ct));
    }
    if (JSON.stringify(nc) === JSON.stringify(cutoff) && [...nf].sort().join() === [...frozen].sort().join()) break;
    cutoff = nc; frozen = nf;
  }
  let counting = st.counting;
  if (ended) { // two recovery rotations that do not see each other end the identity: only the causal past of either stands
    const rrots = st.rotations.filter(r => r.role === 'recovery'), keep = new Set([id]);
    for (const r of rrots) { keep.add(r.b.hash); for (const h of pool.past(r.b.hash)) keep.add(h); }
    counting = new Set([...counting].filter(h => keep.has(h)));
  }
  const sba = { [id]: true };
  for (const b of authored) sba[b.hash] = counting.has(b.hash);
  const keyList = [...st.keys.keys()];
  const timeline = [];
  for (const k of keyList) timeline.push({ key: k, suite: suiteOfKey(k) || 'std', frozen: frozen.has(k) });
  const res = { signed_by_author: sba, keys: keyList.slice().sort(), frozen: [...frozen].filter(k => st.keys.has(k)).sort(), operators: [], info, cutoff, keyMap: st.keys, ended, timeline, rotations: st.rotations, rh, recoveryOk, genKey, idSuite, order, counting };
  return res;
}
// The operators of an agent or machine: authors of live grants of kind operator naming it in refs.to.
function operatorsOf(id, poolIn, visiting) {
  const pool = poolOf(poolIn);
  visiting = visiting || new Set();
  const out = new Set();
  for (const gr of pool.all()) {
    if (gr.type !== 'grant' || gr.state.kind !== 'operator' || gr.refs.to !== id || !isStr(gr.refs.author)) continue;
    if (visiting.has(gr.refs.author) && gr.refs.author !== id) { /* in progress: read below */ }
    const O = gr.refs.author;
    if (O === id) continue;
    const of = identityFold(O, pool, visiting);
    if (of.signed_by_author[gr.hash] !== true) continue;
    // the author ends it by an updates that carries status stopped
    const stopped = pool.all().some(u => u.refs.updates === gr.hash && u.refs.author === O && u.state.status === 'stopped' && of.signed_by_author[u.hash] === true);
    if (!stopped) out.add(O);
  }
  return [...out].sort();
}
// The recovery_reach view: the voided blocks the reach protects (identity.md). arrivals: { hash: time } or null.
function recoveryReachView(rotation, blocks, arrivals) {
  const pool = poolOf(blocks);
  const id = rotation.refs.subject || rotation.refs.author;
  const f = identityFold(id, pool);
  const g = pool.get(id);
  const reach = g && g.state.recovery_reach;
  if (!arrivals || !reach || !arrivals[rotation.hash]) return [];
  const start = addDur(arrivals[rotation.hash], reach, -1);
  const voided = pool.all().filter(b => b.refs.author === id && f.info.has(b.hash) && f.signed_by_author[b.hash] === false);
  const out = [];
  for (const v of voided) {
    const built = pool.all().some(o => o.refs.author !== id && pool.sees(o.hash, v.hash));
    const arr = arrivals[v.hash];
    if (built && arr !== undefined && arr < start) out.push(v.hash);
  }
  return out.sort();
}

// ================================================================ valid(block, context)  (core.md section 8)
// block: { hash?, type, state, refs, signature, suite? }; context: the blocks held (array, Map or Pool). Returns refusals [{ code, detail }].
function uniqueCodes(list) { const seen = new Set(), out = []; for (const f of list) if (!seen.has(f.code)) { seen.add(f.code); out.push({ code: f.code, detail: f.detail || '' }); } return out; }
function validStages(block, poolIn) {
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
  if (block.suite !== undefined && !['std', 'p256', 'sm'].includes(block.suite)) w6.push({ code: 'unknown_suite', detail: block.suite });
  const genesis = type === 'actor' && (refs.author === undefined || 'public_key_sign' in st);
  let signerKey, signerSuite, role = 'key', idf = null;
  if (genesis) {
    signerKey = st.public_key_sign;
    if (!isStr(sig) || !verifyBlock(b, sig, signerKey)) w6.push({ code: 'bad_genesis', detail: 'a genesis is signed by its own key' });
    signerSuite = suiteOfKey(signerKey) || 'std';
  } else {
    const id = refs.author;
    idf = identityFold(id, pool);
    if (!idf.keyMap.size) w6.push({ code: 'bad_signature', detail: 'the author\'s genesis is not held' });
    else {
      // which key opens it: any key the identity ever named, or its recovery key
      let foundKey = null;
      if (st.recovery_key !== undefined && idf.recoveryOk(st.recovery_key) && isStr(sig) && verifyBlock(b, sig, st.recovery_key)) foundKey = { key: st.recovery_key, role: 'recovery' };
      if (!foundKey) {
        const claims = new Set([idf.genKey]);
        for (const x of pool.all()) if (isKeyGrant(x) && x.refs.subject === id && isStr(x.state.public_key_sign)) claims.add(x.state.public_key_sign);
        for (const k of claims) if (isStr(sig) && verifyBlock(b, sig, k)) { foundKey = { key: k, role: 'key' }; break; }
      }
      if (!foundKey) w6.push({ code: 'bad_signature', detail: 'no key of the author opens it' });
      else {
        role = foundKey.role; signerKey = foundKey.key;
        if (role === 'key') {
          const self = isKeyGrant(b) && st.replaces === signerKey;
          const speaks = idf.keyMap.has(signerKey) && !idf.frozen.includes(signerKey) && (self || idf.cutoff[signerKey] === undefined || st.seq <= idf.cutoff[signerKey]);
          if (!speaks) w6.push({ code: 'void_key', detail: 'the key does not speak for the author' });
        } else if (!isKeyGrant(b) && !(refs.defeats !== undefined)) w6.push({ code: 'recovery_scope', detail: 'the recovery key signs only key grants and the defeats a profile gives it' });
        signerSuite = suiteOfKey(signerKey) || 'std';
      }
    }
  }
  // core.md section 8 lists `bad_hash` with the key and signature codes: an id that is no suite's hash of the bytes
  if (block.hash !== undefined) {
    if (!['std', 'p256', 'sm'].some(x => hashOfBlock(b, x) === block.hash)) w6.push({ code: 'bad_hash', detail: 'the id is not the hash of the canonical bytes' });
    else if (signerSuite !== undefined && hashOfBlock(b, signerSuite) !== block.hash) w6.push({ code: 'bad_hash', detail: 'the id is not the hash of the canonical bytes' });
  }
  if (w6.length) return found(6, w6);
  // check 7: prev and seq fit the key's chain, or the block is a skip
  if (!genesis) {
    const id = refs.author, prev = pool.get(refs.prev);
    const bad = d => found(7, [{ code: 'chain', detail: d }]);
    const pinfo = idf.info.get(prev.hash);
    const sameKey = pinfo && pinfo.key === signerKey && prev.refs.author === id;
    const skip = st.skip === true;
    if (sameKey) {
      if (skip ? !(st.seq > prev.state.seq) : st.seq !== prev.state.seq + 1) return bad('seq does not follow prev');
    } else {
      // the key's first block: prev is the block that brought the key in (the genesis, or a key grant), seq 1 (a skip may start higher)
      const via = role === 'recovery' ? { b: pool.get(id) } : idf.keyMap.get(signerKey) && (idf.keyMap.get(signerKey).via || { b: pool.get(id) });
      const bringer = via && (via.b || via);
      const ok = bringer && (bringer.hash === prev.hash || prev.hash === id && signerKey === idf.genKey);
      if (!ok) return bad('prev does not name the block that brought the key in');
      if (skip ? !(st.seq >= 1) : st.seq !== 1) return bad('a key\'s first block has seq 1');
    }
  }
  // check 8: a closed type's required fields, undeclared fields and its module's checks
  const late = [];
  if (CLOSED.has(type) && !genesis) closedFindings(b, { held: pool.m, recoverySigned: role === 'recovery' }, (stage, code, detail) => late.push({ stage, code, detail }));
  if (late.length) return found(8, late);
  return { stage: 0, findings: [] };
}
// The refusal: every code the failing check found, one per code, in the order of protocol.json refusals.codes.block.
const CODE_ORDER = Object.keys(P.refusals.codes.block);
function valid(block, context) { return uniqueCodes(validStages(block, context).findings).sort((a, b) => CODE_ORDER.indexOf(a.code) - CODE_ORDER.indexOf(b.code)); }

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
  const key = k => short && CB.keys.includes(k) ? { int: BigInt(CB.keys.indexOf(k)) } : { text: k };
  const here = timePlace(path);
  return { map: Object.entries(v).map(([k, x]) => {
    const p = [...path, k];
    let val;
    if (path.length === 0 && k === 'type' && short && TYPE_INDEX.includes(x)) val = { int: BigInt(TYPE_INDEX.indexOf(x)) };
    else if (here && P.time_fields.includes(k) && typeof x === 'string' && RX.time.test(x)) val = { int: BigInt(Date.parse(x)) };
    else if (here && k === 'when' && isObj(x)) val = { map: Object.entries(x).map(([wk, wv]) => [key(wk), (wk === 'from' || wk === 'to') && typeof wv === 'string' && RX.time.test(wv) ? { int: BigInt(Date.parse(wv)) } : cbOut(wv, [...p, wk], short)]) };
    else val = cbOut(x, p, short);
    return [key(k), val];
  }) };
}
// cbor_encode(block, short): the message [t, block, signature] (+ a text suite entry when the suite is not std)
function cborEncode(block, short) {
  const body = cbOut({ type: block.type, state: block.state, refs: block.refs }, [], !!short);
  const items = [{ int: BigInt(short ? CB.table : 0) }, body, { bytes: Buffer.from(block.signature, 'hex') }];
  if (block.suite && block.suite !== 'std') items.push({ text: block.suite });
  return cbEnc({ array: items });
}
function cbRead(buf) {
  let at = 0;
  const need = n => { if (at + n > buf.length) throw new Error('cbor: ends too soon'); };
  const item = depth => {
    if (depth > 100) throw new Error('cbor: too deep');
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
    else if (here && P.time_fields.includes(n) && 'int' in x) { const ms = Number(x.int); if (!(ms >= -62167219200000 && ms <= 253402300799999)) throw new Error('cbor: a time outside the years 0000 to 9999'); out[n] = new Date(ms).toISOString(); }
    else if (here && n === 'when' && 'map' in x) {
      const w = {};
      for (const [wk, wv] of x.map) { const wn = name(wk); if (wn in w) throw new Error('cbor: duplicate key'); w[wn] = (wn === 'from' || wn === 'to') && 'int' in wv ? new Date(Number(wv.int)).toISOString() : cbIn(wv, [...p, wn]); }
      out[n] = w;
    } else out[n] = cbIn(x, p);
  }
  return out;
}
// cbor_decode(bytes or hex) -> { hash, type, state, refs, signature, suite? }; the id is the hash of the rebuilt canonical JSON
function cborDecode(input) {
  const buf = Buffer.isBuffer(input) || input instanceof Uint8Array ? Buffer.from(input) : Buffer.from(input, 'hex');
  const m = cbRead(buf);
  if (!('array' in m) || m.array.length < 3 || m.array.length > 4 || !('int' in m.array[0]) || !('map' in m.array[1]) || !('bytes' in m.array[2])) throw new Error('cbor: a message is [t, block, signature]');
  const t = Number(m.array[0].int);
  if (t !== 0 && t !== CB.table) throw new Error('cbor: a key table this reader does not have');
  if (m.array.length === 4 && !('text' in m.array[3])) throw new Error('cbor: the suite is text');
  const suite = m.array.length === 4 ? m.array[3].text : 'std';
  if (m.array[2].bytes.length !== 64 && !(suite === 'p256' && m.array[2].bytes.length > 64)) throw new Error('cbor: a signature is 64 bytes');
  const b = cbIn(m.array[1], []);
  if (Object.keys(b).sort().join() !== 'refs,state,type' || !isObj(b.state) || !isObj(b.refs) || !isStr(b.type) || b.type === '') throw new Error('cbor: a block is { type, state, refs }');
  const out = { hash: hashOfBlock(b, suite), ...b, signature: m.array[2].bytes.toString('hex') };
  if (suite !== 'std') out.suite = suite;
  return out;
}
function cborHeader(h, short) { // a chain header { author, seq, prev, hash }: ids as bytes
  const key = k => short && CB.keys.includes(k) ? { int: BigInt(CB.keys.indexOf(k)) } : { text: k };
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

// ================================================================ what counts in a fold (core.md invariant 3, folds.md Equivocations)
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
function forkPairs(blocksIn) {
  const pool = poolOf(blocksIn);
  const groups = new Map();
  for (const b of pool.all()) {
    if (!isStr(b.refs.author) || !isStr(b.refs.prev)) continue;
    const key = signerKeyOf(b, pool) || b.refs.author;
    const k = b.refs.author + '|' + key + '|' + b.refs.prev;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(b.hash);
  }
  const pairs = [];
  for (const list of groups.values()) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) pairs.push([list[i], list[j]].sort());
  return pairs.sort((a, b) => (a[0] + a[1] < b[0] + b[1] ? -1 : 1));
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
function counts(b, pool) {
  if (!b.refs || !isStr(b.refs.author)) return true; // actors without an author: their own genesis
  const idf = identityFold(b.refs.author, pool);
  if (idf.keyMap.size && idf.signed_by_author[b.hash] === false) return false;
  return !equivocated(pool).has(b.hash);
}

// ================================================================ the chain (nodes.md, folds.md)
function chainFold(blocksIn, id) {
  const pool = new Pool(blocksIn, true); // a chain is read as given: its gaps are what it reports
  const mine = pool.all().filter(b => b.refs.author === id && b.hash !== id && b.state.seq !== undefined);
  const sorted = mine.slice().sort((a, b) => a.state.seq - b.state.seq || (a.hash < b.hash ? -1 : 1));
  const pairs = forkPairs(new Pool(mine, true));
  const inPair = new Set(pairs.flat());
  const gaps = [], skips = [], broken = [];
  const bySeq = [];
  for (const b of sorted) if (!bySeq.length || bySeq[bySeq.length - 1].state.seq !== b.state.seq) bySeq.push(b);
  let expect = 1;
  for (const b of sorted) {
    if (b.state.skip === true) skips.push(b.hash);
  }
  let last = 0;
  for (const b of bySeq) {
    // the lowest limits.gaps_max missing numbers are listed (a block may say seq 2^53 - 1)
    if (b.state.seq > last + 1 && !b.state.skip) for (let n = last + 1; n < b.state.seq && gaps.length < P.limits.gaps_max; n++) gaps.push(n);
    last = Math.max(last, b.state.seq);
  }
  const have = new Set([id, ...mine.map(b => b.hash)]);
  for (const b of sorted) {
    const p = pool.get(b.refs.prev);
    if (!have.has(b.refs.prev) || (p && p.state.seq !== undefined && p.state.seq >= b.state.seq)) broken.push(b.hash);
  }
  // blocks counted: those before the first pair
  const firstPairSeq = pairs.length ? Math.min(...pairs.flat().map(h => pool.get(h).state.seq)) : Infinity;
  const counted = sorted.filter(b => b.state.seq < firstPairSeq && !inPair.has(b.hash));
  // protocol.json (folds.chain.output.head) says head is "hash of the latest block": a string. The vector writes it as { hash }.
  return {
    head: counted.length ? counted[counted.length - 1].hash : null, length: counted.length, gaps, skips: skips.sort(), equivocations: pairs, broken: broken.sort(),
    ok: !gaps.length && !pairs.length && !broken.length,
  };
}
const nextLink = (headBlock, bringer) => headBlock ? { seq: headBlock.state.seq + 1, prev: headBlock.hash } : { seq: 1, prev: bringer };
const header = b => { const h = { author: b.refs.author, seq: b.state.seq, prev: b.refs.prev, hash: b.hash }; if (b.state.withheld === true) h.withheld = true; if (b.state.skip === true) h.skip = true; return h; };

// ---- pull filter (nodes.md): exact match on type, kind, author, hash, record, marks and refs; keys AND together
function matches(b, filter, heldIn) {
  const pool = poolOf(heldIn);
  for (const [k, v] of Object.entries(filter || {})) {
    if (k === 'type') { if (b.type !== v) return false; }
    else if (k === 'kind') { if (b.state.kind !== v) return false; }
    else if (k === 'author') { if (b.refs.author !== v) return false; }
    else if (k === 'hash') { if (b.hash !== v) return false; }
    else if (k === 'record') {
      let cur = b, n = 0, ok = false;
      while (cur && n++ < 1000) { if (cur.hash === v) { ok = true; break; } cur = cur.refs.updates ? pool.get(cur.refs.updates) : null; }
      if (!ok) return false;
    } else if (k === 'marks') { if (!asList(b.state.marks).some(m => isObj(m) && m.scheme === v.scheme && m.value === v.value)) return false; }
    else if (k === 'refs') { for (const [rk, rv] of Object.entries(v)) if (!asList(b.refs[rk]).includes(rv)) return false; }
    else return false; // a key the filter does not know matches nothing
  }
  return true;
}

// ---- push admission (nodes.md): a block waits until every block it rests on is held, then is judged once; blocks are judged in rounds
// against the store as it stood when the round began, so the answer never depends on the order of a push; two blocks of one key naming one
// prev are both kept and listed as a pair, and neither block of a pair that arrives in one round is taken.
// The key that signed a block as far as the reader can tell: a whole block's signature opens with a key of its author; a sealed block held by its public
// header carries the header's signature. null when it cannot be told. A place in a chain is (author, prev, key); an unknown key rivals any key.
function keyOfEntry(b, pool) {
  if (!isStr(b.refs.author)) return null;
  if (b.type !== undefined) return signerKeyOf(b, pool);
  const idf = identityFold(b.refs.author, pool);
  for (const k of idf.keyMap.keys()) if (isStr(b.header_signature) && verifyBytes(Buffer.from(jcs(entryHeader(b)), 'utf8'), b.header_signature, k)) return k;
  return null;
}
const placeOf = (b, pool) => (isStr(b.refs.author) && isStr(b.refs.prev) ? { author: b.refs.author, prev: b.refs.prev, key: keyOfEntry(b, pool) } : null);
const samePlace = (a, b) => a.author === b.author && a.prev === b.prev && (a.key === null || b.key === null || a.key === b.key);
const normaliseHeld = held => (held || []).map(h => (h && h.header && h.type === undefined ? headerEntry(h) : h)).filter(Boolean);
function accept(incomingIn, heldIn) {
  const pool = new Pool(poolOf(normaliseHeld(heldIn.all ? heldIn.all() : heldIn)).all());
  let pending = incomingIn.filter(b => b && !(pool.get(b.hash) && pool.get(b.hash).type !== undefined));
  const taken = [], refused = [], waiting = [], pairs = new Map();
  for (;;) {
    const ready = pending.filter(b => !unmetIn(b, pool.m).length).sort((x, y) => (x.hash < y.hash ? -1 : x.hash > y.hash ? 1 : 0)); // inside a round, ascending by hash
    if (!ready.length) break;
    pending = pending.filter(b => unmetIn(b, pool.m).length);
    pool.folds = new Map(); pool.memo = new Map(); pool._eq = null;
    const good = [];
    for (const b of ready) {
      const why = valid(b, pool);
      for (const r of why) refused.push({ hash: b.hash, code: r.code, detail: r.detail });
      if (!why.length) good.push({ b, at: placeOf(b, pool) });
    }
    const forked = new Set();
    for (const g of good) {
      if (!g.at) continue;
      const others = [...pool.all().filter(x => x.hash !== g.b.hash && isStr(x.refs.author) && x.refs.author === g.at.author && x.refs.prev === g.at.prev).filter(x => samePlace(placeOf(x, pool), g.at)).map(x => x.hash),
        ...good.filter(o => o.b.hash !== g.b.hash && o.at && samePlace(o.at, g.at)).map(o => o.b.hash)];
      for (const o of others) { forked.add(g.b.hash); pairs.set([o, g.b.hash].sort().join(), [o, g.b.hash].sort()); }
    }
    for (const g of good) { pool.m.set(g.b.hash, g.b); if (!forked.has(g.b.hash)) taken.push(g.b); }
  }
  for (const b of [...pending].sort((x, y) => (x.hash < y.hash ? -1 : x.hash > y.hash ? 1 : 0))) waiting.push({ hash: b.hash, needs: unmetIn(b, pool.m) });
  return { taken, waiting, refused, equivocations: [...pairs.values()].sort((a, b) => (a.join() < b.join() ? -1 : 1)) };
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
function entryHeader(e) { const h = { author: e.refs.author, seq: e.state.seq, prev: e.refs.prev, hash: e.hash }; if (e.state.withheld === true) h.withheld = true; if (e.state.skip === true) h.skip = true; return h; }
function acceptSealed(incomingIn, heldIn) {
  const pool = new Pool(normaliseHeld(heldIn));
  const taken = [], refused = [], waiting = [], pairs = new Map();
  let pending = [];
  for (const m of incomingIn) {
    const e = headerEntry(m);
    if (!e) { refused.push({ hash: '', code: 'shape', detail: 'a sealed block is { version, header, header_signature, envelope }' }); continue; }
    const held = pool.get(e.hash);
    if (held && held.type !== undefined) {
      if (held.refs.author === e.refs.author && held.state.seq === e.state.seq && held.refs.prev === e.refs.prev) taken.push(e);
      else refused.push({ hash: e.hash, code: 'bad_hash', detail: 'the header does not describe the block held under this hash' });
    } else if (!held) pending.push(e);
  }
  taken.sort((x, y) => (x.hash < y.hash ? -1 : x.hash > y.hash ? 1 : 0)); refused.sort((x, y) => (x.hash < y.hash ? -1 : x.hash > y.hash ? 1 : 0)); // the first round: the other halves of blocks held
  const keyOf = b => keyOfEntry(b, pool), place = b => placeOf(b, pool), same = samePlace;
  const judge = e => {
    const st = e.state, refs = e.refs;
    const ok = Number.isInteger(st.seq) && st.seq >= 1 && !idProblem(refs.author) && !idProblem(refs.prev) && !idProblem(e.hash) && ['withheld', 'skip'].every(f => !(f in st) || st[f] === true) && isStr(e.header_signature) && !e.bad_header;
    if (!ok) return [{ code: 'shape', detail: 'a sealed block\'s header is { author, seq, prev, hash } and its signature; withheld and skip only true' }];
    const idf = identityFold(refs.author, pool);
    if (!idf.keyMap.size) return [{ code: 'bad_signature', detail: 'the author\'s genesis is not held' }];
    let signer = null;
    for (const k of idf.keyMap.keys()) if (verifyBytes(Buffer.from(jcs(entryHeader(e)), 'utf8'), e.header_signature, k)) { signer = k; break; }
    if (!signer) return [{ code: 'bad_signature', detail: 'the header is not signed by a key of its author' }];
    if (!(idf.keyMap.has(signer) && !idf.frozen.includes(signer) && (idf.cutoff[signer] === undefined || st.seq <= idf.cutoff[signer]))) return [{ code: 'void_key', detail: 'the key does not speak for the author' }];
    const p = pool.get(refs.prev);
    const pKey = keyOf(p);
    const sameKey = p.refs && p.refs.author === refs.author && (pKey !== null ? pKey === signer : p.type === undefined);
    const skip = st.skip === true;
    if (sameKey) { if (skip ? !(st.seq > p.state.seq) : st.seq !== p.state.seq + 1) return [{ code: 'chain', detail: 'seq does not follow prev' }]; }
    else {
      if (p.state.public_key_sign !== signer) return [{ code: 'chain', detail: 'prev does not name the block that brought the key in' }];
      if (skip ? !(st.seq >= 1) : st.seq !== 1) return [{ code: 'chain', detail: 'a key\'s first block has seq 1' }];
    }
    return [];
  };
  for (;;) {
    const ready = pending.filter(b => !unmetIn(b, pool.m).length).sort((x, y) => (x.hash < y.hash ? -1 : x.hash > y.hash ? 1 : 0));
    if (!ready.length) break;
    pending = pending.filter(b => unmetIn(b, pool.m).length);
    pool.folds = new Map(); pool.memo = new Map(); pool._eq = null;
    const good = [];
    for (const e of ready) {
      const why = judge(e);
      for (const r of why) refused.push({ hash: e.hash, code: r.code, detail: r.detail });
      if (!why.length) good.push({ e, at: place(e) });
    }
    const forked = new Set();
    for (const g of good) {
      if (!g.at) continue;
      const others = [...pool.all().filter(x => x.hash !== g.e.hash && isStr(x.refs.author) && x.refs.author === g.at.author && x.refs.prev === g.at.prev).filter(x => same(place(x), g.at)).map(x => x.hash),
        ...good.filter(o => o.e.hash !== g.e.hash && o.at && same(o.at, g.at)).map(o => o.e.hash)];
      for (const o of others) { forked.add(g.e.hash); pairs.set([o, g.e.hash].sort().join(), [o, g.e.hash].sort()); }
    }
    for (const g of good) { pool.m.set(g.e.hash, g.e); if (!forked.has(g.e.hash)) taken.push(g.e); }
  }
  for (const b of [...pending].sort((x, y) => (x.hash < y.hash ? -1 : x.hash > y.hash ? 1 : 0))) waiting.push({ hash: b.hash, needs: unmetIn(b, pool.m) });
  return { taken, waiting, refused, equivocations: [...pairs.values()].sort((a, b) => (a.join() < b.join() ? -1 : 1)) };
}

// ================================================================ authority (authority.md)
const actNames = b => isStr(b.state.kind) ? [b.type, b.type + '.' + b.state.kind] : [b.type];
function stoppedByAuthor(g, pool) {
  return pool.all().some(u => u.refs.updates === g.hash && u.refs.author === g.refs.author && u.state.status === 'stopped' && counts(u, pool));
}
// A grant is live only while every ancestor grant is live (invariant 9).
function grantLive(g, pool, seen = new Set()) {
  if (!g || g.type !== 'grant' || seen.has(g.hash)) return false;
  seen.add(g.hash);
  if (!counts(g, pool) || stoppedByAuthor(g, pool)) return false;
  if (g.refs.parent !== undefined) return grantLive(pool.get(g.refs.parent), pool, seen);
  return true;
}
// The schema marking an act undo: never (things.md). It is named in refs.schema, or targets the act.
function undoNever(b, pool) {
  const s = b.refs.schema && pool.get(b.refs.schema);
  if (s && s.state.undo === 'never') return true;
  return pool.all().some(x => x.type === 'thing' && x.state.kind === 'schema' && x.state.undo === 'never' && actNames(b).includes(x.state.target));
}
function whyNotUnder(b, poolIn) {
  const pool = poolOf(poolIn);
  const fail = d => [{ code: 'not_live', detail: d }];
  const g = pool.get(b.refs.under);
  if (!g || g.type !== 'grant') return fail('the grant is not held');
  // a witness's trigger is the witness's own word under a successor grant, which is for the successor (profiles/successor.md)
  const trigger = b.type === 'observe' && b.state.kind === 'trigger' && g.state.kind === 'successor';
  if (trigger && !asList(g.state.witnesses).includes(b.refs.author)) return fail('the signer is not a witness of the successor grant');
  if (!trigger && g.refs.to !== undefined && g.refs.to !== b.refs.author) return fail('the signer is not the receiver of the grant');
  if (!grantLive(g, pool)) return fail('the grant is not live');
  const sc = !trigger && isObj(g.state.scope) ? g.state.scope : {};
  const names = actNames(b);
  if (sc.acts !== undefined && !names.some(n => asList(sc.acts).includes(n))) return fail('the act is outside the grant\'s scope');
  if (undoNever(b, pool)) {
    const specificGrant = sc.limit !== undefined && asList(sc.acts).some(n => names.includes(n) && n.includes('.'));
    const ask = b.refs.for && pool.get(b.refs.for);
    const askedAndAccepted = ask && ask.type === 'promise' && [ask.state.what, ask.refs.what].some(w => names.includes(w)) &&
      pool.all().some(a => a.type === 'promise' && a.refs.answers === ask.hash && a.state.status === 'accepted' && a.refs.author === g.refs.author && counts(a, pool));
    if (!specificGrant && !askedAndAccepted) return fail('an act that cannot be undone needs a specific accepted ask or a grant that names it with a limit');
  }
  return [];
}
// live_grant (view): every grant's scope.until is later than the clock of the node that relies on the act
const liveGrant = (block, grants, clock) => grants.every(g => { const u = g.state && g.state.scope && g.state.scope.until; return u === undefined || u > clock; });
// withdrawal_seen (view): in the causal past of the counterparty's block, or arrived on its node
function withdrawalSeen(w, block, blocks, arrivals) {
  const pool = poolOf(blocks);
  return pool.sees(block.hash, w.hash) || !!(arrivals && arrivals[w.hash] !== undefined);
}

// ================================================================ circles (circles.md, folds.md)
// The fold reads the circle and every member grant naming it, in causal order. limit = a set of hashes (the causal past of a block).
function circleFold(circleId, poolIn, limit, exclude) {
  const pool = poolOf(poolIn);
  const inScope = h => (!limit || limit.has(h)) && !(exclude && exclude.has(h));
  const C = pool.get(circleId);
  const empty = { founder: null, members: {}, removed: {}, roles: [] };
  if (!C || C.type !== 'actor' || !isStr(C.refs.author) && false) return empty;
  const founder = C.refs.author;
  const roles = Array.isArray(C.state.roles) ? C.state.roles : [];
  const powersOf = names => new Set(asList(names).flatMap(n => (roles.find(r => r.name === n) || { powers: [] }).powers));
  const needed = (C.state.removal && C.state.removal.needed) || 1;
  const grants = pool.all().filter(b => b.type === 'grant' && b.state.kind === 'member' && b.refs.subject === circleId && inScope(b.hash) && counts(b, pool));
  const founderRoles = roles.length ? [roles[0].name] : [];
  const members = {};
  // powers of an author at a block: the circle fold of the block's causal past (recursion on a strictly smaller set)
  const holdsAt = (author, power, atBlock) => {
    const sub = new Set(pool.past(atBlock.hash));
    sub.delete(atBlock.hash);
    const f = circleFold(circleId, pool, sub, exclude);
    const m = f.members[author];
    return !!m && powersOf(m.roles).has(power);
  };
  // base member grants: not an answer, not a version of another grant
  const invites = grants.filter(g => g.refs.answers === undefined && g.refs.updates === undefined && g.state.status === undefined);
  const validInvite = g => g.refs.as === circleId && (g.refs.author === founder ? true : holdsAt(g.refs.author, 'admit', g));
  const versionsOf = (base) => { const chain = [base]; for (;;) { const nxt = grants.filter(u => u.refs.updates === chain[chain.length - 1].hash && u.state.status === undefined && u.refs.as === circleId && (u.refs.author === founder || holdsAt(u.refs.author, 'admit', u))); if (!nxt.length) break; chain.push(nxt.sort((a, b) => pool.past(a.hash).size - pool.past(b.hash).size)[nxt.length - 1]); } return chain; };
  const answerTo = (v, status, m) => grants.find(a => a.refs.answers === v.hash && a.state.status === status && (m === undefined || a.refs.author === m));
  const removedMap = {}, memberInfo = {}, droppedCuts = new Map();
  for (const inv of invites) {
    if (!validInvite(inv)) continue;
    const m = inv.refs.to;
    if (m === undefined) continue; // GUESS: an open group's joiners are not folded here
    const acc = answerTo(inv, 'accepted', m);
    if (!acc) continue;
    // a removal that has not seen the member's answer comes before it: the invitation ends and the answer accepts nothing
    const early = grants.filter(u => u.refs.updates === inv.hash && u.state.status === 'stopped' && u.refs.as === circleId && (u.refs.author === founder || holdsAt(u.refs.author, 'remove', u)));
    if (m !== founder && early.some(u => !pool.sees(u.hash, acc.hash))) {
      for (const u of early) (droppedCuts.get(inv.hash) || droppedCuts.set(inv.hash, []).get(inv.hash)).push(u.state.counted_to !== undefined ? u.state.counted_to : u.hash);
      continue;
    }
    const chain = versionsOf(inv);
    let counted = asList(inv.state.roles).slice();
    for (let i = 1; i < chain.length; i++) {
      const v = chain[i], prevSet = counted;
      const ack = answerTo(v, 'accepted', m);
      counted = asList(v.state.roles).filter(r => prevSet.includes(r) || ack);
    }
    memberInfo[m] = memberInfo[m] || [];
    memberInfo[m].push({ inv, acc, roles: counted, chain });
  }
  // ends: the member's own stopped/declined answer to a grant they accepted, or a remover's stopped update
  const stops = [];
  for (const [m, list] of Object.entries(memberInfo)) for (const info of list) {
    for (const g of info.chain) {
      const leave = grants.find(a => a.refs.answers === g.hash && a.state.status === 'stopped' && a.refs.author === m);
      if (leave) stops.push({ m, info, by: m, block: leave, leave: true });
      const rem = grants.filter(u => u.refs.updates === g.hash && u.state.status === 'stopped' && u.refs.as === circleId);
      for (const r of rem) stops.push({ m, info, by: r.refs.author, block: r, leave: false });
    }
  }
  const stopEffective = new Map();
  for (const s of stops) {
    if (s.leave) { stopEffective.set(s.block.hash, true); continue; }
    const remover = s.by;
    const holds = remover === founder || holdsAt(remover, 'remove', s.block);
    if (!holds) { stopEffective.set(s.block.hash, false); continue; }
    const target = roles.length && (memberInfo[s.m] || []).some(i => powersOf(i.roles).has('admit') || powersOf(i.roles).has('remove'));
    if (target) {
      const agreeing = new Set(stops.filter(x => x.m === s.m && !x.leave && x.by !== s.m && (x.by === founder || holdsAt(x.by, 'remove', x.block))).map(x => x.by)); // N *other* holders of remove
      if (!(agreeing.has(founder) || agreeing.size >= needed)) { stopEffective.set(s.block.hash, false); continue; }
    }
    stopEffective.set(s.block.hash, true);
  }
  // crossing removals: of two removers each removing the other, the one whose grant is earlier in causal order wins; the founder above all
  const grantOf = id => ((memberInfo[id] || [])[0] || {}).inv;
  for (const s of stops) {
    if (s.leave || !stopEffective.get(s.block.hash)) continue;
    if (s.by === founder) continue;
    const crossing = stops.find(x => !x.leave && x.m === s.by && x.by === s.m && stopEffective.get(x.block.hash));
    if (crossing) {
      if (crossing.by === founder) { stopEffective.set(s.block.hash, false); continue; }
      const gMine = grantOf(s.by), gTheirs = grantOf(s.m);
      if (gMine && gTheirs) {
        if (pool.sees(gTheirs.hash, gMine.hash)) { /* my grant is earlier: my removal wins */ }
        else if (pool.sees(gMine.hash, gTheirs.hash)) stopEffective.set(s.block.hash, false); // their grant is earlier: theirs wins
      }
    }
  }
  // A member may hold several accepted grants. The heads are those no later acceptance of theirs supersedes (their acceptance is seen by no other
  // acceptance of the member's); a member is in while a head has not ended and holds the roles of every head that has not; they are out when
  // every head has ended, and `removed` keeps the counted_to of the last stop that took their last head (of several that do not see each other,
  // the one with the lowest hash), null when it names none.
  const cutsOf = new Map(droppedCuts); // a grant that ended -> the cut of every authorised stop of it
  const authorised = s => s.leave || s.by === founder || holdsAt(s.by, 'remove', s.block);
  for (const [m, list] of Object.entries(memberInfo)) {
    const heads = list.filter(info => !list.some(o => o !== info && pool.sees(o.acc.hash, info.acc.hash)));
    const endsOf = info => stops.filter(s => s.m === m && s.info === info && stopEffective.get(s.block.hash));
    const live = heads.filter(h => !endsOf(h).length);
    for (const h of heads) if (endsOf(h).length) for (const g of h.chain) for (const s of stops.filter(x => x.m === m && x.info === h && authorised(x))) {
      const grantHash = s.block.refs.updates || s.block.refs.answers;
      if (!cutsOf.has(grantHash)) cutsOf.set(grantHash, []);
      cutsOf.get(grantHash).push(s.block.state.counted_to !== undefined ? s.block.state.counted_to : s.block.hash);
    }
    if (live.length) {
      const roles = live.length === 1 ? live[0].roles.slice() : [...new Set(live.flatMap(h => h.roles))].sort();
      const grant = live.map(h => h.inv.hash).sort()[0];
      members[m] = { roles, grant, counted_to: null, grants: live.map(h => h.inv.hash).sort() };
    } else if (heads.some(h => endsOf(h).length)) {
      const ends = heads.flatMap(h => endsOf(h)).map(s => s.block);
      const last = ends.filter(e => !ends.some(o => o !== e && pool.sees(o.hash, e.hash))).sort((a, b) => (a.hash < b.hash ? -1 : 1))[0];
      removedMap[m] = last.state.counted_to === undefined ? null : last.state.counted_to;
    }
  }
  members[founder] = { roles: founderRoles, grant: circleId, counted_to: null, grants: [circleId] };
  return { founder, members, removed: removedMap, roles, cuts: cutsOf };
}
// circle_state: the fold, then the cutoff (circles.md): a block a member signed as the circle that is neither the cut of a grant that ended nor in
// the cut's causal past carries no authority for the circle, whether or not it saw the stop. The grants such a block made are then set aside and the
// circle read again; the stops themselves are never set aside (two that cross follow the crossing rule).
function circleWhole(circleId, poolIn, limit) {
  const pool = poolOf(poolIn);
  const first = circleFold(circleId, pool);
  const voided = new Set();
  if (first.cuts && first.cuts.size) {
    for (const b of pool.all()) {
      const author = b.refs.author;
      if (!isStr(author) || author === first.founder || b.refs.as !== circleId) continue;
      if (b.type === 'grant' && b.state.kind === 'member' && b.state.status === 'stopped' && b.refs.updates !== undefined && b.refs.answers === undefined) continue;
      const past = new Set(pool.past(b.hash)); past.delete(b.hash);
      const m = circleFold(circleId, pool, past).members[author];
      if (!m) continue;
      if ([...first.cuts].some(([g, cuts]) => m.grants.includes(g) && cuts.some(c => b.hash !== c && !pool.sees(c, b.hash)))) voided.add(b.hash);
    }
  }
  const out = voided.size || limit ? circleFold(circleId, pool, limit, voided) : first;
  return { ...out, void: voided };
}
const circleState = (circleId, blocks) => { const f = circleWhole(circleId, blocks); return { founder: f.founder, members: f.members, removed: f.removed }; };
// may_act_as(block, circle): the author holds a role with the sign power in the circle's fold of the block's causal past
function mayActAsIn(block, circleId, pool) {
  if (!pool.get(block.hash)) return false; // a block that rests on blocks not held is not read yet
  if (circleId === undefined || circleId === null) return true; // GUESS: a block that signs for no circle needs no role
  if (block.refs.as !== circleId) return false;
  const past = new Set(pool.past(block.hash)); past.delete(block.hash);
  const f = circleWhole(circleId, pool, past);
  const C = pool.get(circleId);
  const m = f.members[block.refs.author];
  if (!m || !C || f.void.has(block.hash)) return false;
  return asList(m.roles).some(rn => ((C.state.roles || []).find(r => r.name === rn) || { powers: [] }).powers.includes('sign'));
}
function mayActAs(block, circleId, blocks) {
  return mayActAsIn(block, circleId, new Pool([block, ...poolOf(blocks).all()]));
}
// members_then(block, recipient): the members of a circle (or the holders of circle#role) in the circle fold of the block's causal past
function membersThen(block, recipient, blocks) {
  const pool = new Pool([block, ...poolOf(blocks).all()]);
  const [circleId, role] = recipient.includes('#') ? [recipient.slice(0, recipient.lastIndexOf('#')), recipient.slice(recipient.lastIndexOf('#') + 1)] : [recipient, null];
  const past = new Set(pool.past(block.hash)); past.delete(block.hash);
  const f = circleWhole(circleId, pool, past);
  return Object.entries(f.members).filter(([, m]) => role === null || m.roles.includes(role)).map(([id]) => id).sort();
}
// circle_key (profiles/rekeys.md)
function circleKey(circleId, blocks) {
  const pool = poolOf(blocks);
  const C = pool.get(circleId);
  const rekeys = pool.all().filter(b => b.type === 'grant' && b.state.kind === 'key' && b.state.epoch !== undefined && b.refs.subject === circleId && b.refs.as === circleId && counts(b, pool));
  const countedBy = new Map();
  const can = r => {
    const past = new Set(pool.past(r.hash)); past.delete(r.hash);
    const f = circleWhole(circleId, pool, past);
    const m = f.members[r.refs.author];
    return !!m && !f.void.has(r.hash) && ((C.state.roles || []).filter(x => m.roles.includes(x.name)).some(x => asList(x.powers).includes('rekey')));
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
function perUnitTotal(minor, per, qty) {
  const q = dec(qty.value), p = dec(per.value);
  const num = BigInt(minor) * q.n * p.d, den = p.n * q.d;
  return Number((2n * num + den) / (2n * den));
}

// ================================================================ a promise's stage (folds.md, promises.md)
function promiseStage(firstIn, poolIn) {
  // the first promise is read with the blocks held; one that rests on blocks not held is not read yet: no stage (folds.md)
  const pool = new Pool(typeof firstIn === 'string' ? poolOf(poolIn).all() : [firstIn, ...poolOf(poolIn).all()]);
  const P = pool.get(typeof firstIn === 'string' ? firstIn : firstIn.hash);
  if (!P) return null;
  // who a block speaks for (folds.md, Who a block speaks for): one party. A block that names a circle in `as` speaks for it when its author may
  // sign for it, else for no one; a block under a live grant made for its receiver speaks for the grantor (the circle the grant was signed `as`
  // when its signer may sign for it, else its author); any other block speaks for its author.
  const grantor = g => g.refs.as !== undefined ? (mayActAsIn(g, g.refs.as, pool) ? g.refs.as : null) : g.refs.author;
  const cover = b => {
    if (b.refs.under === undefined) return null;
    const g = pool.get(b.refs.under);
    if (!g || g.type !== 'grant' || !grantLive(g, pool) || (g.refs.to !== undefined && g.refs.to !== b.refs.author)) return { principal: null, covered: false };
    const sc = isObj(g.state.scope) ? g.state.scope : {};
    return { principal: grantor(g), covered: sc.acts === undefined || actNames(b).some(n => asList(sc.acts).includes(n)) };
  };
  const whoMemo = new Map();
  const who = b => {
    if (!whoMemo.has(b.hash)) {
      let w;
      if (b.refs.as !== undefined) w = mayActAsIn(b, b.refs.as, pool) ? b.refs.as : null;
      else { const c = cover(b); w = c && c.principal ? c.principal : b.refs.author; }
      whoMemo.set(b.hash, w);
    }
    return whoMemo.get(b.hash);
  };
  const quote = b => { const c = cover(b); return !!c && !c.covered; };
  // an allocation starts its own deal (promises.md, Who may bind): the offerer's accepted answer to a request on an open offer. It is read with
  // the allocation as head and the offer as root; an allocation the open offer does not bind has no deal.
  const alloc = (() => {
    if (P.type !== 'promise' || P.state.status !== 'accepted' || P.refs.answers === undefined) return null;
    const R = pool.get(P.refs.answers);
    if (!R || R.type !== 'promise' || R.state.status !== 'accepted') return null;
    const O = pool.get(R.refs.answers);
    if (!O || O.type !== 'promise' || O.refs.answers !== undefined || (O.refs.from !== undefined && O.refs.to !== undefined)) return null;
    const t = promiseStage(O, pool).takers.find(x => x.allocation === P.hash);
    return t ? { O, R, t } : null;
  })();
  const Q = alloc ? alloc.O : P; // the root: sides, terms, what
  const out = { stage: null, stop: null, from: null, offer: Q.hash, accept: null, sides: { from: Q.refs.from === undefined ? null : Q.refs.from, to: Q.refs.to === undefined ? null : Q.refs.to }, quantity: null, takers: [], forks: [], lines: [], total: null, paid: null, stopped: [] };
  // a side that names a thing is whoever owns the thing now (promises.md, Bearer)
  const sideOf = r => { if (r === undefined) return undefined; const t = pool.get(r); return t && t.type === 'thing' ? ownershipFold(t, pool).owner : r; };
  let from = sideOf(Q.refs.from), to = sideOf(Q.refs.to);
  // an allocation's open side is the taker who made the request
  if (alloc) { if (from === undefined) from = who(alloc.R); if (to === undefined) to = who(alloc.R); }
  const all = pool.all().filter(b => counts(b, pool));
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
  // an updates of a promise that is not a stop counts for nothing: terms are fixed once written (promises.md)
  const D = [...deal.values()].filter(b => !(b.type === 'promise' && b.refs.updates !== undefined && b.refs.answers === undefined && b.state.status !== 'stopped'));
  const isSide = id => id !== null && id !== undefined && (id === from || id === to);
  if (!isSide(who(Q))) return null; // a first promise that speaks for neither side is nobody's promise: no stage
  const open = !alloc && (Q.refs.from === undefined || Q.refs.to === undefined);
  const self = !alloc && from !== undefined && from === to && from === who(Q);
  // ---- the live offers: P, or the latest counters between the same two sides, each signed by the side that did not sign the offer it answers
  // (not on an open offer). Two counters that cross both stand.
  let lives = [Q];
  if (!open) {
    for (;;) {
      const next = [];
      for (const o of lives) for (const c of D) {
        if (c.type === 'promise' && c.refs.answers === o.hash && c.state.status === undefined && c.hash !== P.hash && isSide(who(c)) && who(c) !== who(o) && !next.includes(c)) next.push(c);
      }
      if (!next.length) break;
      lives = next;
    }
  }
  let live = lives[0];
  const stopsBefore = D.filter(b => b.type === 'promise' && b.state.status === 'stopped' && b.state.stop === 'before' && isSide(who(b)));
  const onward = D.filter(b => b.type === 'promise' && b.state.status === 'stopped' && b.state.stop === 'onward' && isSide(who(b))).sort((a, b) => pool.past(a.hash).size - pool.past(b.hash).size);
  const declines = D.filter(b => b.type === 'promise' && b.state.status === 'declined');
  const seenStop = a => stopsBefore.some(s => pool.sees(a.hash, s.hash));
  // ---- binding accepts
  let accept = null, takers = [], forks = [];
  if (alloc) { accept = P; takers = [alloc.t]; }
  else if (self) accept = P;
  else if (!open) {
    // every binding accept of a live offer; the earliest in causal order binds, and two that do not see each other prove the accepter's lie:
    // neither binds and both are listed in forks
    const cands = [];
    for (const o of lives) {
      const offerAuthor = who(o), otherSide = offerAuthor === from ? to : from;
      const principalOk = !quote(o) || D.some(b => b.type === 'promise' && b.state.status === 'accepted' && b.refs.answers === o.hash && who(b) === offerAuthor && !quote(b));
      for (const a of D) {
        if (a.type !== 'promise' || a.state.status !== 'accepted' || a.refs.answers !== o.hash || who(a) !== otherSide || quote(a)) continue;
        if (seenStop(a) || declines.some(d => d.refs.answers === a.hash && who(d) === offerAuthor) || !principalOk) continue;
        if (!cands.includes(a)) cands.push(a);
      }
    }
    const firsts = cands.filter(a => !cands.some(c => c !== a && pool.sees(a.hash, c.hash)));
    if (firsts.length === 1) accept = firsts[0]; else if (firsts.length > 1) forks = firsts.map(x => x.hash).sort();
    if (accept) live = pool.get(accept.refs.answers) || live;
  } else {
    // an open offer binds only through the offerer's allocation: its own accepted answer to an accept
    const requests = D.filter(b => b.type === 'promise' && b.state.status === 'accepted' && b.refs.answers === P.hash && who(b) !== who(Q));
    const allocs = D.filter(b => b.type === 'promise' && b.state.status === 'accepted' && requests.some(r => r.hash === b.refs.answers) && who(b) === who(Q))
      .sort((a, b) => pool.past(a.hash).size - pool.past(b.hash).size);
    const chain = [];
    for (const a of allocs) {
      if (!chain.length || pool.sees(a.hash, chain[chain.length - 1].hash)) chain.push(a); else forks.push(a.hash);
    }
    const offeredQty = Q.state.terms && Q.state.terms.quantity ? (Q.state.terms.quantity.max ? Number(Q.state.terms.quantity.max.value) : decNum(Q.state.terms.quantity)) : null;
    let sum = 0;
    for (const a of chain) {
      const r = requests.find(x => x.hash === a.refs.answers);
      const q = (a.state.terms && a.state.terms.quantity) || (r.state.terms && r.state.terms.quantity) || null;
      const qn = q ? decNum(q) : 0;
      if (offeredQty !== null && sum + qn > offeredQty) continue; // invariant 11: what is bound never exceeds what is offered
      sum += qn;
      takers.push({ who: who(r), request: r.hash, allocation: a.hash, quantity: q });
    }
    if (takers.length) accept = pool.get(takers[0].allocation);
  }
  out.takers = takers; out.forks = forks.sort();
  // the offer the binding accept answers; with none, the live offer when there is only one
  out.offer = accept ? live.hash : (lives.length === 1 ? lives[0].hash : null);
  out.live = lives.map(o => o.hash).sort();
  out.accept = accept ? accept.hash : null;
  if (accept) out.accept = accept.hash;
  // an open offer is settled by no one: each allocation is a deal of its own (promises.md, Who may bind). What is left to say of the offer itself is
  // that it binds, or that its offerer stopped it onward.
  if (open && accept) {
    // its quantity is what its allocations bind together, and its total is what the price comes to for that
    const offered = Q.state.terms && Q.state.terms.quantity ? (Q.state.terms.quantity.max ? Q.state.terms.quantity.max : Q.state.terms.quantity) : null;
    const withQ = takers.filter(t => t.quantity);
    const unit = offered ? offered.unit : (withQ.length ? withQ[0].quantity.unit : undefined);
    const amounts = withQ.filter(t => t.quantity.unit === unit).map(t => t.quantity.value);
    if (amounts.length) out.quantity = { value: decSum(amounts), unit };
    const pr = Q.state.terms && Q.state.terms.price;
    if (isObj(pr) && has(pr, 'minor', 'currency')) out.total = { minor: pr.minor, currency: pr.currency };
    else if (isObj(pr) && has(pr, 'money', 'per') && isObj(pr.per) && out.quantity) out.total = { minor: perUnitTotal(pr.money.minor, pr.per, out.quantity), currency: pr.money.currency };
    const ow = onward.filter(b => who(b) === who(Q));
    if (ow.length) { out.stage = 'stopped'; out.stop = 'onward'; out.from = ow[0].hash; } else out.stage = 'accepted';
    return out;
  }
  // the quantity chosen
  const terms = isObj(live.state.terms) ? live.state.terms : (isObj(Q.state.terms) ? Q.state.terms : {});
  const pterms = isObj(Q.state.terms) ? Q.state.terms : {};
  let chosen = null;
  if (takers.length === 1) chosen = takers[0].quantity;
  else if (accept && accept !== P && accept.state.terms && accept.state.terms.quantity) chosen = accept.state.terms.quantity;
  else if (isObj(terms.quantity) && terms.quantity.value !== undefined) chosen = terms.quantity;
  out.quantity = chosen;
  // total: a plain money price is the whole price; a per-unit price is minor times quantity over per; lines add up
  const price = terms.price;
  let total = null;
  if (Array.isArray(terms.lines)) total = { minor: terms.lines.reduce((s, l) => s + (isObj(l.price) ? l.price.minor : 0), 0), currency: terms.lines.find(l => isObj(l.price)) ? terms.lines.find(l => isObj(l.price)).price.currency : undefined };
  else if (isObj(price) && has(price, 'minor', 'currency')) total = { minor: price.minor, currency: price.currency };
  else if (isObj(price) && has(price, 'money', 'per') && isObj(price.per)) {
    if (takers.length > 1) { const sumq = takers.reduce((s, t) => s + decNum(t.quantity), 0); total = { minor: perUnitTotal(price.money.minor, price.per, { value: String(sumq) }), currency: price.money.currency }; }
    else if (chosen) total = { minor: perUnitTotal(price.money.minor, price.per, chosen), currency: price.money.currency };
  }
  out.total = total;
  // ---- settling: counted blocks made for P
  const schema = Q.refs.schema && pool.get(Q.refs.schema);
  const confirmers = new Set(schema && isObj(schema.state.grounds) ? asList(schema.state.grounds.confirmers).flatMap(c => c.includes('#') ? membersThen({ hash: P.hash }, c, pool) : [c]) : []);
  const confirmed = h => pool.all().some(c => asList(c.refs.confirms).includes(h) && confirmers.has(c.refs.author) && counts(c, pool));
  const accepted = (h, receiver) => D.some(a => a.refs.answers === h && a.state.status === 'accepted' && (receiver === undefined || who(a) === receiver));
  // a block a side of the deal, or a confirmer the schema names, defeats counts for nothing (folds.md, Settling)
  const defeated = h => pool.all().some(c => asList(c.refs.defeats).includes(h) && counts(c, pool) && (isSide(who(c)) || confirmers.has(c.refs.author)));
  const settling = D.filter(b => !defeated(b.hash) && b.refs.answers === undefined && b.hash !== P.hash && b.type !== 'promise' && asList(b.refs.for).includes(P.hash) && isSide(who(b)));
  const goods = [], pays = [], refunds = [], works = [];
  for (const b of settling) {
    if (b.type === 'transfer') {
      const money = b.state.money !== undefined;
      const ok = b.refs.to_owner !== undefined ? (accepted(b.hash, b.refs.to_owner) || confirmed(b.hash)) : (b.state.count !== undefined || confirmed(b.hash));
      if (!ok) continue;
      if (!money) { if (b.state.amount === undefined || true) goods.push(b); }
      else if (b.refs.to_owner === from) pays.push(b);
      else refunds.push(b);
    } else if (b.type === 'observe' && b.state.kind === 'work') {
      const receiver = who(b) === from ? to : from;
      if (accepted(b.hash, receiver) || confirmed(b.hash)) works.push(b);
    } else if (b.type === 'transform') {
      if (accepted(b.hash) || confirmed(b.hash)) goods.push(b);
    }
  }
  const moneyFor = b => {
    if (isObj(b.state.money) && Array.isArray(b.state.split)) { const e = b.state.split.find(s => s.for === P.hash); return e ? e.money : null; }
    return b.state.money;
  };
  const sameCur = (m) => m && total && jcs(m.currency) === jcs(total.currency);
  const paidMinor = pays.map(moneyFor).filter(m => m && (!total || sameCur(m))).reduce((s, m) => s + m.minor, 0);
  const anyPay = pays.map(moneyFor).filter(Boolean).length > 0;
  if (anyPay) out.paid = { minor: paidMinor, currency: total ? total.currency : pays.map(moneyFor).find(Boolean).currency };
  const refunded = refunds.map(moneyFor).filter(m => m && (!total || sameCur(m))).reduce((s, m) => s + m.minor, 0);
  // lines: how much of each line the counted transfers moved
  const lineSpecs = Array.isArray(terms.lines) ? terms.lines.map(l => ({ id: l.id, unit: l.quantity && l.quantity.unit, needed: l.quantity ? decNum(l.quantity) : null })) :
    (Q.refs.what !== undefined && !(Q.state.what !== undefined && Q.refs.what === undefined) ? [{ id: null, unit: chosen ? chosen.unit : (terms.quantity && terms.quantity.unit), needed: chosen ? decNum(chosen) : (isObj(terms.quantity) && terms.quantity.value !== undefined ? decNum(terms.quantity) : null) }] : []);
  const isWork = Q.refs.what === undefined && Q.state.what !== undefined;
  for (const l of lineSpecs) {
    let moved = 0, whole = false;
    for (const t of goods) {
      if (l.id !== null && t.state.line !== l.id) continue;
      if (t.state.amount) moved += decNum(t.state.amount);
      else {
        const inst = pool.get(asList(t.refs.what)[0]);
        const pack = inst && inst.state.pack;
        if (pack && pack.unit === l.unit) moved += decNum(pack); else whole = true;
      }
    }
    if (l.needed !== null && (whole || moved > l.needed)) moved = l.needed;
    out.lines.push({ id: l.id, needed: l.needed, moved });
  }
  let covered = false;
  if (lineSpecs.length) covered = out.lines.every(l => l.needed === null ? l.moved > 0 : l.moved >= l.needed);
  else if (isWork) {
    if (isObj(pterms.quantity) && pterms.quantity.value !== undefined) covered = works.filter(w => w.state.amount && w.state.amount.unit === pterms.quantity.unit).reduce((s, w) => s + decNum(w.state.amount), 0) >= decNum(pterms.quantity);
    else covered = works.length > 0;
  }
  const paidAll = total === null || (out.paid !== null && out.paid.minor >= total.minor);
  const anySettling = goods.length + pays.length + works.length > 0;
  // ---- onward stop and occurrences
  const occ = new Set();
  for (const b of D) if (b.type === 'promise' && b.state.status === 'stopped' && isObj(b.state.stop) && Array.isArray(b.state.stop.occurrences) && isSide(who(b))) b.state.stop.occurrences.forEach(o => occ.add(o));
  out.stopped = [...occ].sort();
  // ---- the stage: the first of these that holds, from the furthest along back to the start
  if (accept && covered && paidAll && refunded > 0 && out.paid && refunded >= out.paid.minor) out.stage = 'reversed';
  else if (accept && covered && paidAll) out.stage = 'done';
  else if (accept && onward.length) { out.stage = 'stopped'; out.stop = 'onward'; out.from = onward[0].hash; }
  else if (accept && anySettling) out.stage = 'underway';
  else if (accept) out.stage = 'accepted';
  else if (stopsBefore.length) { out.stage = 'stopped'; out.stop = 'before'; }
  else if (!open && lives.some(o => declines.some(d => d.refs.answers === o.hash && isSide(who(d)) && who(d) !== who(o)))) out.stage = 'declined';
  // a block sent despite a live STOP is kept; consent decides what binds: the ask is read as declined in advance (consent.md)
  else if (!open && consentFold(who(Q) === from ? to : from, Q.refs.author, pool, Q.refs.under).word === 'stop') out.stage = 'declined';
  else out.stage = who(Q) === to && who(Q) !== from ? 'asked' : 'offered';
  return out;
}
function promiseView(first, blocks, opts) {
  const s = promiseStage(first, blocks);
  if (!s) return null;
  const pool = new Pool([first, ...poolOf(blocks).all()]);
  // expired once every live offer has an expires the reader's clock has passed (one still open could bind)
  const past = s.live.length && s.live.every(h => { const o = pool.get(h), exp = o && o.state.terms && o.state.terms.expires; return exp && opts && opts.now !== undefined && opts.now > exp; });
  if ((s.stage === 'offered' || s.stage === 'asked') && past) return { ...s, stage: 'expired' };
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
function speakerOf(b, pool) { if (b.refs.as !== undefined) return mayActAsIn(b, b.refs.as, pool) ? b.refs.as : null; return b.refs.author; }
function ownershipFold(thingIn, blocks) {
  const held = poolOf(blocks);
  const pool = typeof thingIn === 'string' || held.get(thingIn.hash) ? held : new Pool([thingIn, ...held.all()]);
  const thing = pool.get(typeof thingIn === 'string' ? thingIn : thingIn.hash);
  if (!thing) return { owner: null, transfers: [], conflict: null }; // an instance that rests on blocks not held is not read yet
  const speaker = b => speakerOf(b, pool);
  const maker = speaker(thing); // a thing made `as` a circle is the circle's (folds.md, Who a block speaks for)
  const named = t => t.refs.to_owner !== undefined;
  const transfers = pool.all().filter(t => t.type === 'transfer' && t.refs.answers === undefined && asList(t.refs.what).includes(thing.hash) && t.state.amount === undefined && (named(t) || t.state.count !== undefined) && counts(t, pool));
  const accepted = t => !named(t) || pool.all().some(a => a.refs.answers === t.hash && a.state.status === 'accepted' && speaker(a) === t.refs.to_owner && counts(a, pool));
  let owner = maker, prev = null, conflict = null;
  const list = [];
  for (;;) {
    const elig = transfers.filter(t => speaker(t) === owner && accepted(t) && (prev ? pool.sees(t.hash, prev.hash) : true) && t !== prev && !list.includes(t));
    if (!elig.length) break;
    const maximal = elig.filter(t => !elig.some(u => u !== t && pool.sees(u.hash, t.hash)));
    if (maximal.length > 1) { conflict = maximal.map(t => t.hash).sort(); break; }
    const t = maximal[0];
    list.push(t); prev = t;
    owner = named(t) ? t.refs.to_owner : null;
    if (owner === null) break;
  }
  return { owner, transfers: list.map(t => t.hash), conflict };
}
function whereNow(thingIn, blocks, seen) {
  const held = poolOf(blocks);
  const pool = typeof thingIn === 'string' || held.get(thingIn.hash) ? held : new Pool([thingIn, ...held.all()]);
  const thing = typeof thingIn === 'string' ? pool.get(thingIn) : pool.get(thingIn.hash) || thingIn;
  seen = seen || new Set();
  if (seen.has(thing.hash)) return [];
  seen = new Set([...seen, thing.hash]);
  const own = ownershipFold(thing, pool);
  const ownerNow = own.owner === null ? speakerOf(thing, pool) : own.owner;
  const holders = new Set();
  const moves = pool.all().filter(t => t.type === 'transfer' && t.refs.answers === undefined && asList(t.refs.what).includes(thing.hash) && counts(t, pool));
  for (const t of moves) if (t.refs.to_holder !== undefined && (speakerOf(t, pool) === ownerNow || speakerOf(t, pool) === speakerOf(thing, pool))) holders.add(t.refs.to_holder);
  const placed = moves.filter(t => t.refs.to_place !== undefined && (speakerOf(t, pool) === ownerNow || speakerOf(t, pool) === speakerOf(thing, pool) || holders.has(speakerOf(t, pool))));
  const maximal = placed.filter(t => !placed.some(u => u !== t && pool.sees(u.hash, t.hash)));
  const direct = maximal.length ? [...new Set(maximal.map(t => t.refs.to_place))] : (thing.refs.place !== undefined ? [thing.refs.place] : []);
  const res = new Set();
  for (const p of direct) {
    const pb = pool.get(p);
    const sub = pb ? whereNow(pb, pool, seen) : [];
    if (sub.length) sub.forEach(x => res.add(x)); else res.add(p);
  }
  return [...res].sort();
}

// ================================================================ the successor view (profiles/successor.md)
function successorView(grant, blocks, o) {
  const pool = poolOf(blocks);
  const arrivals = (o && o.arrivals) || {}, now = o && o.now;
  const witnesses = asList(grant.state.witnesses), needed = grant.state.needed || witnesses.length || 1, wait = grant.state.wait;
  // a witness's trigger is an observe of kind trigger by a listed witness, naming the grant in refs.under (profiles/successor.md)
  let events = pool.all().filter(b => b.type === 'observe' && b.state.kind === 'trigger' && b.refs.under === grant.hash && witnesses.includes(b.refs.author) && arrivals[b.hash] !== undefined && counts(b, pool));
  const seenW = new Set(); events = events.filter(b => seenW.has(b.refs.author) ? false : (seenW.add(b.refs.author), true));
  const defeats = pool.all().filter(b => b.refs.defeats !== undefined && b.refs.author === grant.refs.author && arrivals[b.hash] !== undefined);
  const cancelled = new Set();
  const fire = list => { const s = list.map(e => arrivals[e.hash]).sort(); return list.length >= needed ? { since: s[needed - 1], fires: addDur(s[needed - 1], wait) } : { since: null, fires: null }; };
  for (let changed = true; changed;) {
    changed = false;
    const standing = events.filter(e => !cancelled.has(e.hash)), f = fire(standing);
    for (const d of defeats) {
      const e = events.find(x => x.hash === d.refs.defeats);
      if (e && !cancelled.has(e.hash) && (f.fires === null || arrivals[d.hash] <= f.fires)) { cancelled.add(e.hash); changed = true; break; }
    }
  }
  const standing = events.filter(e => !cancelled.has(e.hash)), f = fire(standing);
  return { events: standing.map(e => e.hash).sort(), cancelled: [...cancelled].sort(), since: f.since, fires: f.fires, fired: f.fires !== null && now !== undefined && now >= f.fires };
}

// ================================================================ consent and admission (consent.md)
function consentFold(person, sender, blocks, under) {
  const pool = poolOf(blocks);
  const has = sender !== undefined && sender !== null;
  // Consent follows the principal: the sender is named by itself, its operators, and the grantor of the live grant it acts under (the grant's author and
  // the circle it was signed as), a grant others act under (not a key or member grant) addressed to the sender or open.
  const principals = () => {
    const g = under === undefined || under === null ? null : pool.get(under);
    if (!has || !g || g.type !== 'grant' || ['key', 'member'].includes(g.state.kind) || (g.refs.to !== undefined && g.refs.to !== sender) || !grantLive(g, pool)) return [];
    return [g.refs.author, g.refs.as].filter(x => x !== undefined);
  };
  const names = !has ? [] : [sender, ...operatorsOf(sender, pool), ...principals()];
  // A recorder binds only its own side: it is named, or one of its operators is.
  const sideOf = (recorder) => has && (names.includes(recorder) || operatorsOf(recorder, pool).some(o => names.includes(o)));
  const personOf = b => b.refs.from !== undefined ? b.refs.from : b.refs.author;
  const all = pool.all().filter(b => b.type === 'observe' && b.state.kind === 'consent' && personOf(b) === person && counts(b, pool));
  const stops = all.filter(b => b.state.word === 'stop');
  const cons = all.filter(b => {
    if (b.refs.author === person) return true;
    if (b.state.word === 'stop') return sideOf(b.refs.author);
    // Her fresh yes through a recorder outside the asker's side counts only as the lift of a stop in its causal past.
    if (b.state.word === 'yes') return !sideOf(b.refs.author) && stops.some(st => pool.sees(b.hash, st.hash));
    return false;
  });
  const later = (a, b) => pool.sees(a.hash, b.hash) || (a.state.seq > b.state.seq && signerKeyOf(a, pool) === signerKeyOf(b, pool));
  const decide = group => {
    if (!group.length) return null;
    const maximal = group.filter(a => !group.some(b => b !== a && later(b, a)));
    const stop = maximal.filter(b => b.state.word === 'stop').sort((x, y) => (x.hash < y.hash ? -1 : 1))[0];
    if (stop) return stop;
    // A tie between other words leaves no live word; a tie that agrees stands, naming the lowest hash.
    if (maximal.some(b => b.state.word !== maximal[0].state.word)) return null;
    return maximal.sort((x, y) => (x.hash < y.hash ? -1 : 1))[0];
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
  const consent = consentFold(recipient, author, pool, block.refs.under);
  const authorGenesis = pool.get(author);
  const isAgent = (authorGenesis && ['agent', 'machine'].includes(authorGenesis.state.kind)) || block.refs.under !== undefined;
  const answered = pool.all().some(b => b.refs.author === recipient && asList(b.refs.answers).some(h => { const t = pool.get(h); return t && t.refs.author === author; }));
  const stranger = !answered && consent.word !== 'yes';
  const listed = asList(rule.parties).includes(author);
  if (stranger && isAgent) {
    const channel = asList(rule.order_channel).some(n => actNames(block).includes(n));
    if (!channel) out.push({ code: 'not_human', detail: 'a first block to a stranger that an agent signed' });
  }
  if (stranger && !listed && rule.per_stranger !== undefined && today >= rule.per_stranger) out.push({ code: 'not_admitted', detail: 'the node took its per_stranger blocks for the day' });
  const order = Object.keys(P.refusals.codes.message);
  return out.sort((x, y) => order.indexOf(x.code) - order.indexOf(y.code));
}
// GUESS: "inside" is read as: every region the node holds in is written in stays_in (EU is not expanded to its countries)
const residencyRefusals = (block, holdsIn) => {
  const stays = block.state.stays_in;
  if (stays === undefined) return [];
  return asList(holdsIn).every(r => asList(stays).includes(r)) ? [] : [{ code: 'residency', detail: 'the node holds outside stays_in' }];
};
const depositShapeOk = d => isObj(d) && !moneyProblem(d.money) && isStr(d.holder) && !idProblem(d.holder) && Object.keys(d).every(k => ['money', 'holder'].includes(k));
function depositPaid(ask, deposit, blocks) {
  const pool = poolOf(blocks);
  return pool.all().some(t => t.type === 'transfer' && asList(t.refs.for).includes(ask.hash) && t.refs.to_owner === deposit.holder && isObj(t.state.money) &&
    jcs(t.state.money.currency) === jcs(deposit.money.currency) && t.state.money.minor >= deposit.money.minor && counts(t, pool));
}
// A model's reading is the agent's claim; it becomes the person's only when she puts that fact to someone else in her own step (things.md, Truth)
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
  const replay = (hasC === hasCh) || (hasC && !(Number.isInteger(m.counter) && m.counter > (o.highest === undefined ? -1 : o.highest))) || (hasCh && !asList(o.issued).includes(m.challenge));
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
  const plain = open(msg.envelope, privHex);
  const b = blockOnly(plain.block);
  if (Buffer.byteLength(canonical(b.type, b.state, b.refs), 'utf8') > P.limits.block_bytes) { const e = new Error('size_limit'); e.code = 'size_limit'; e.kind = 'refusal'; throw e; }
  const suite = msg.header && isStr(msg.header.hash) && msg.header.hash.startsWith('sm3:') ? 'sm' : 'std';
  return { version: plain.version, block: plain.block, signature: plain.signature, reveals: plain.reveals, hash: hashOfBlock(b, suite) };
}
const headerSignedBy = (msg, pubHex) => verifyBytes(Buffer.from(jcs(msg.header), 'utf8'), msg.header_signature, pubHex);
// wrap / unwrap (core.md section 6): a public block as a message
// ---- answering a pull (nodes.md, Pull): the matches in arrival order, each with its arrival number; a lie travels with its proof
function answerPull(log, request, node, privateKey, cap, asker, heldIn, suite) {
  const since = Number(request.since) || 0;
  const limit = request.limit > 0 ? Math.min(request.limit, cap) : cap;
  asker = asker || request.signer;
  const held = Array.isArray(heldIn) ? poolOf(heldIn) : poolOf(log.map(e => e.block));
  let found = log.filter(e => e.n > since && matches(e.block, request.filter, held)).sort((a, b) => a.n - b.n);
  if (request.heads) {
    const named = new Set(found.flatMap(e => [...asList(e.block.refs.prev), ...asList(e.block.refs.updates)]));
    found = found.filter(e => !named.has(e.block.hash));
  }
  found = found.slice(0, limit);
  const next = found.length ? found[found.length - 1].n : since;
  // a block of a pair (one key, one prev) is never answered without the other, matched or not, before since or after
  const have = new Set(found.map(e => e.block.hash)), proofs = [];
  for (const e of found) {
    const at = placeOf(e.block, held);
    if (!at) continue;
    for (const o of log) {
      if (have.has(o.block.hash) || o.block.refs.author !== at.author || o.block.refs.prev !== at.prev) continue;
      const p = placeOf(o.block, held);
      if (p && samePlace(p, at)) { have.add(o.block.hash); proofs.push(o); }
    }
  }
  found = found.concat(proofs).sort((a, b) => a.n - b.n);
  const messageOf = e => {
    const a = e.block.state.audience;
    if (a === 'public' || !Array.isArray(a)) return wrap(e.block);
    const copy = asker && e.copies && e.copies[asker];
    if (copy) return copy;
    return { version: P.version, header: e.header || header(e.block), header_signature: e.header_signature === undefined ? null : e.header_signature };
  };
  const answer = { node, request: hashStr('std', jcs(request)), blocks: found.map(e => ({ n: e.n, message: messageOf(e) })), next };
  return answer;
}
const wrap = b => { const m = { version: P.version, block: blockOnly(b), signature: b.signature }; if (b.suite && b.suite !== 'std') m.suite = b.suite; return m; };
function unwrap(m) {
  const suite = suiteOf(m.suite);
  const b = blockOnly(m.block);
  const out = { hash: hashOfBlock(b, suite), ...b, signature: m.signature };
  if (suite !== 'std') out.suite = suite;
  return out;
}


// profiles/tasks.md, Sensor conditions: the readings are the observes of the condition's kind that name the sensor in refs.from, with an
// amount in the condition's unit and an at not later than `now`. The window runs from `now` less `over` to `now`. It holds when a reading at or
// before the start exists (it gives the state at the start) and it, and every reading inside the window, keeps to the rule.
function decCmp(x, y) { // decimal strings (core.md section 3), compared exactly
  const parts = t => { const neg = t.startsWith('-'); const [i, f = ''] = t.replace('-', '').split('.'); return { neg, i, f }; };
  const a = parts(x), b = parts(y), w = Math.max(a.f.length, b.f.length);
  const n = p => (p.neg ? -1n : 1n) * BigInt(p.i + p.f.padEnd(w, '0'));
  const d = n(a) - n(b);
  return d < 0n ? -1 : d > 0n ? 1 : 0;
}
function readingConditionHolds(c, blocks, now) {
  if (!c || !isStr(c.reading) || !isStr(c.kind) || !isStr(c.op) || !isStr(c.over) || !c.value || !isStr(c.value.value)) return false;
  const start = addDur(now, c.over, -1);
  const rs = (blocks || []).filter(b => b.type === 'observe' && b.state.kind === c.kind && [].concat(b.refs.from || []).includes(c.reading)
    && b.state.amount && b.state.amount.unit === c.value.unit && isStr(b.state.amount.value) && isStr(b.state.at) && b.state.at <= now)
    .sort((x, y) => (x.state.at < y.state.at ? -1 : x.state.at > y.state.at ? 1 : 0));
  const keeps = r => { const k = decCmp(r.state.amount.value, c.value.value); return { lt: k < 0, le: k <= 0, gt: k > 0, ge: k >= 0, eq: k === 0 }[c.op] === true; };
  const before = rs.filter(r => r.state.at <= start);
  if (!before.length) return false;
  return keeps(before[before.length - 1]) && rs.filter(r => r.state.at > start).every(keeps);
}

// ================================================================ the door: one case per rule
function door(op, ...a) {
  switch (op) {
    case 'recovery_reach': return recoveryReachView(a[0], a[1], a[2]);
    case 'check_chain': return chainFold(a[0], a[1]);
    case 'fork_pairs': return forkPairs(a[0]);
    case 'header': return header(a[0]);
    case 'needs': return a[1] === undefined || a[1] === null ? needsOf(a[0]) : unmetIn(a[0], new Pool(a[1]).m);
    case 'accept': { const r = accept(a[0], a[1]); return { ...r, taken: r.taken.map(b => b.hash) }; }
    case 'past_of': return pastOfBlock(a[0], a[1]);
    case 'sees': return pastOfBlock(a[0], a[2]).includes(a[1].hash);
    case 'may_act_as': return mayActAs(a[0], a[1], a[2]);
    case 'circle_state': return circleState(a[0], a[1]);
    case 'ownership': return ownershipFold(a[0], a[1]);
    case 'where_now': return whereNow(a[0], a[1]);
    case 'spec': return { protocol: P };
    case 'accept_sealed': { const r = acceptSealed(a[0], a[1]); return { ...r, taken: r.taken.map(b => b.hash) }; }
    case 'matches': return matches(a[0], a[1], a[2]);
    case 'successor_view': return successorView(a[0], a[1], { now: a[2], arrivals: a[3] });
    case 'answer_pull': return answerPull(a[0], a[1], a[2], a[3], a[4] === undefined || a[4] === null ? 500 : a[4], a[5], a[6], a[7]);
    case 'keypair': return keypair(a[0], a[1]);
    case 'sign': return signBlock(a[0], a[1], a[2]);
    case 'verify': return verifyBlock(a[0], a[1], a[2]);
    case 'hash': return hashOfBlock({ type: a[0], state: a[1], refs: a[2] }, a[3]);
    case 'valid': return valid(a[0], a[1]);
    case 'recovery_key_hash': return recoveryKeyHash(a[0], a[1]);
    case 'salted_hash': return saltedHash(a[0], a[1], a[2]);
    case 'wrap': return wrap(a[0]);
    case 'unwrap': return unwrap(a[0]);
    case 'seal': return seal(a[0], a[1], a[2], a[3]);
    case 'open': return open(a[0], a[1]);
    case 'cbor_encode': return cborEncode(a[0], a[1]).toString('hex');
    case 'cbor_decode': return cborDecode(a[0]);
    case 'verify_message': return verifyMessage(a[0], a[1]);
    case 'passkey_challenge': return passkeyChallengeOf(a[0]);
    case 'passkey_signature': return passkeySignature(a[0], a[1], a[2]);
    case 'suite_of_key': return suiteOfKey(a[0]);
    case 'key_timeline': return identityFold(a[0], a[1]).timeline;
    case 'strict_text': return strictText(a[0]);
    case 'next_link': return nextLink(a[0], a[1]);
    case 'due': return due(a[0], a[1]);
    case 'refusals': return refusals(a[0], a[1], a[2], a[3]);
    case 'promise_view': return promiseView(a[0], a[1], a[2]);
    case 'promise_stage': return promiseStage(a[0], a[1]);
    case 'live_grant': return liveGrant(a[0], a[1], a[2]);
    case 'withdrawal_seen': return withdrawalSeen(a[0], a[1], a[2], a[3]);
    case 'consent': return consentFold(a[0], a[1], a[2], a[3]);
    case 'admission_refusals': return admissionRefusals(a[0], a[1], a[2], a[3], a[4]);
    case 'receipt_code': return receiptCode(a[0], a[1]);
    case 'code_matches': return codeMatches(a[0], a[1]);
    case 'residency_refusals': return residencyRefusals(a[0], a[1]);
    case 'deposit_shape_ok': return depositShapeOk(a[0]);
    case 'deposit_paid': return depositPaid(a[0], a[1], a[2]);
    case 'reading_is_persons_claim': return readingIsPersonsClaim(a[0], a[1], a[2]);
    case 'reading_condition_holds': return readingConditionHolds(a[0], a[1], a[2]);
    default: throw new Error('the oracle has no op ' + op);
  }
}

// ================================================================ exports
module.exports = {
  P, door, jcs, canonical, canonOf, hashBytes, hashStr, hashOfBlock, saltedHash, recoveryKeyHash, receiptCode, keypair, signBlock, verifyBlock, verifyBytes, signBytes,
  seal, open, suiteOfKey, encPublicOf, check, refusals, strictText, contentFindings, normHeld, Pool, identityFold, operatorsOf, recoveryReachView, addDur, valid, validStages,
  cborEncode, cborDecode, cborHeader, cborHeaderDecode, cborEncodePush, cborDecodePush, chainFold, forkPairs, nextLink, header, matches, accept,
  whyNotUnder, liveGrant, withdrawalSeen, circleFold, circleState, mayActAs, membersThen, circleKey, countedIn, promiseStage, promiseView, due, ownershipFold, whereNow,
  successorView, consentFold, admissionRefusals, residencyRefusals, depositShapeOk, depositPaid, readingIsPersonsClaim, signMessage, verifyMessage, pullRefusals, pushRefusals,
  answerSignedBy, pushAnswer, pushRequest, wellKnownErrors, announcement, openCopy, headerSignedBy, wrap, unwrap, counts, grantLive,
};
