'use strict';
// FoodBlock 1.6, clean-room round 3. Built from spec/core.md and the modules it indexes (spec/protocol.md), protocol.json,
// aliases.json, canonical.md and transport.md only. Plain Node, built-in crypto.
const crypto = require('crypto');
const SPEC = require('path').join(__dirname, '..') + '/';
const P = require(SPEC + 'protocol.json');
const A = require(SPEC + 'aliases.json');

// ---------------------------------------------------------------- canonical form (canonical.md)
function ser(v, inRefs) {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error('Infinity and NaN are not allowed');
    return Object.is(v, -0) ? '0' : String(v);
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return JSON.stringify(v.normalize('NFC'));
  if (Array.isArray(v)) {
    let items = v.filter(x => x !== null && x !== undefined);
    if (inRefs && items.every(x => typeof x === 'string')) items = items.map(s => s.normalize('NFC')).sort();
    return '[' + items.map(x => ser(x, inRefs)).filter(x => x !== undefined).join(',') + ']';
  }
  if (typeof v === 'object') {
    const parts = [];
    for (const k of Object.keys(v).sort()) {
      const s = ser(v[k], inRefs || k === 'refs');
      if (s !== undefined) parts.push(JSON.stringify(k) + ':' + s);
    }
    return '{' + parts.join(',') + '}';
  }
  throw new Error('not JSON: ' + typeof v);
}
const canonical = (type, state, refs) => ser({ type, state: state || {}, refs: refs || {} }, false);
const canonOf = b => canonical(b.type, b.state, b.refs);
const sha256 = s => crypto.createHash('sha256').update(typeof s === 'string' ? Buffer.from(s, 'utf8') : s).digest('hex');
const hashOf = b => sha256(canonOf(b));
const canonMsg = m => { const o = { ...m }; delete o.signature; return ser(o, false); };

// ---------------------------------------------------------------- keys and signatures
const pub = hex => crypto.createPublicKey({ key: Buffer.from(hex, 'hex'), format: 'der', type: 'spki' });
const priv = hex => crypto.createPrivateKey({ key: Buffer.from(hex, 'hex'), format: 'der', type: 'pkcs8' });
const signStr = (s, privHex) => crypto.sign(null, Buffer.from(s, 'utf8'), priv(privHex)).toString('hex');
function verifyStr(s, pubHex, sigHex) {
  try { return /^[0-9a-f]{128}$/.test(sigHex) && crypto.verify(null, Buffer.from(s, 'utf8'), pub(pubHex), Buffer.from(sigHex, 'hex')); }
  catch { return false; }
}
const signBlock = (b, privHex) => signStr(canonOf(b), privHex);
const verifyBlock = (b, pubHex, sig) => verifyStr(canonOf(b), pubHex, sig);
function newSigningKey() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return { public_key_sign: publicKey.export({ format: 'der', type: 'spki' }).toString('hex'),
    private_key: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('hex') };
}

// ---------------------------------------------------------------- commitments (Privacy)
const commitment = (saltHex, value) => sha256(saltHex + value);
const randHex = n => crypto.randomBytes(n).toString('hex');

// ---------------------------------------------------------------- envelopes (Encoding: Envelope)
const b64u = b => Buffer.from(b).toString('base64url');
const xPriv = (dHex, xHex) => crypto.createPrivateKey({ key: { kty: 'OKP', crv: 'X25519', d: b64u(Buffer.from(dHex, 'hex')), x: b64u(Buffer.from(xHex, 'hex')) }, format: 'jwk' });
const xPub = xHex => crypto.createPublicKey({ key: { kty: 'OKP', crv: 'X25519', x: b64u(Buffer.from(xHex, 'hex')) }, format: 'jwk' });
function kek(alg, secret, ephHex, recipHex) {
  if (alg === 'x25519-hkdf-sha256-aes-256-gcm')
    return Buffer.from(crypto.hkdfSync('sha256', secret, Buffer.concat([Buffer.from(ephHex, 'hex'), Buffer.from(recipHex, 'hex')]), Buffer.from(P.envelope.hkdf_info, 'utf8'), 32));
  if (alg === 'x25519-aes-256-gcm') return secret;
  throw new Error('unknown alg ' + alg);
}
function gcmOpen(key, iv, ct, tag) { const d = crypto.createDecipheriv('aes-256-gcm', key, iv); d.setAuthTag(tag); return Buffer.concat([d.update(ct), d.final()]); }
function gcmSeal(key, iv, pt) { const c = crypto.createCipheriv('aes-256-gcm', key, iv); const ct = Buffer.concat([c.update(pt), c.final()]); return { ct, tag: c.getAuthTag() }; }
function seal(plaintextObj, recipientEncKeysHex, alg = P.envelope.write) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519');
  const ephHex = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url').toString('hex');
  const ck = crypto.randomBytes(32), iv = crypto.randomBytes(12);
  const { ct, tag } = gcmSeal(ck, iv, Buffer.from(JSON.stringify(plaintextObj), 'utf8'));
  const recipients = recipientEncKeysHex.map(r => {
    const secret = crypto.diffieHellman({ privateKey, publicKey: xPub(r) });
    const k = kek(alg, secret, ephHex, r), n = crypto.randomBytes(12);
    const s = gcmSeal(k, n, ck);
    return { encrypted_key: Buffer.concat([s.ct, s.tag, n]).toString('base64') };
  });
  return { alg, ephemeral_key: ephHex, nonce: iv.toString('base64'), ciphertext: Buffer.concat([ct, tag]).toString('base64'), recipients };
}
function openEnvelope(env, xPrivHex, xPubHex) {
  if (!P.envelope.read.includes(env.alg)) throw new Error('alg not read: ' + env.alg);
  const secret = crypto.diffieHellman({ privateKey: xPriv(xPrivHex, xPubHex), publicKey: xPub(env.ephemeral_key) });
  const k = kek(env.alg, secret, env.ephemeral_key, xPubHex);
  const c = Buffer.from(env.ciphertext, 'base64'), iv = Buffer.from(env.nonce, 'base64');
  for (const r of env.recipients || []) { // key_hash, if any, is ignored (aliases.json envelope.ignored)
    const b = Buffer.from(r.encrypted_key, 'base64');
    if (b.length !== 60) continue;
    let ck; try { ck = gcmOpen(k, b.subarray(48, 60), b.subarray(0, 32), b.subarray(32, 48)); } catch { continue; }
    return JSON.parse(gcmOpen(ck, iv, c.subarray(0, c.length - 16), c.subarray(c.length - 16)).toString('utf8'));
  }
  return null;
}

// ---------------------------------------------------------------- aliases (generous reading)
const clone = o => JSON.parse(JSON.stringify(o));
const deepEq = (a, b) => ser(a, false) === ser(b, false);
function getP(o, path) { let x = o; for (const p of path.split('.')) { if (x == null || typeof x !== 'object') return undefined; x = x[p]; } return x; }
function hasP(o, path) { return getP(o, path) !== undefined; }
function setP(o, path, v) { const ps = path.split('.'); let x = o; for (const p of ps.slice(0, -1)) { if (x[p] == null || typeof x[p] !== 'object') x[p] = {}; x = x[p]; } x[ps[ps.length - 1]] = v; }
function delP(o, path) { const ps = path.split('.'); let x = o; for (const p of ps.slice(0, -1)) { if (x == null || typeof x !== 'object') return; x = x[p]; } if (x && typeof x === 'object') delete x[ps[ps.length - 1]]; }
function whenHolds(b, when) {
  for (const [path, want] of Object.entries(when || {})) {
    const v = getP(b, path);
    if (want === '*') { if (v === undefined) return false; }
    else if (want === null) { if (v !== undefined) return false; }
    else if (!deepEq(v, want)) return false;
  }
  return true;
}
function applyRule(b, rule, out) {
  const force = !!rule.force;
  for (const [o, n] of Object.entries(rule.refs || {})) if (b.refs[o] !== undefined && (force || b.refs[n] === undefined)) { b.refs[n] = b.refs[o]; delete b.refs[o]; }
  for (const [f, t] of Object.entries(rule.move || {})) if (hasP(b, f) && (force || !hasP(b, t))) { const v = getP(b, f); delP(b, f); setP(b, t, v); }
  for (const [t, f] of Object.entries(rule.copy || {})) if (hasP(b, f) && (force || !hasP(b, t))) setP(b, t, clone(getP(b, f)));
  for (const [t, fs] of Object.entries(rule.join || {})) { const vs = fs.map(f => getP(b, f)).filter(v => v !== undefined); setP(b, t, vs.join('.')); }
  for (const d of rule.drop || []) delP(b, d);
  for (const [path, v] of Object.entries(rule.set || {})) if (force || !hasP(b, path)) setP(b, path, clone(v));
  if (rule.settles) out.settles = b.refs[rule.settles];
  let changed = false;
  if (rule.type && rule.type !== b.type) { b.type = rule.type; changed = true; }
  if (rule.kind && rule.kind !== b.state.kind) { b.state.kind = rule.kind; changed = true; }
  return changed;
}
function readAs(block) {
  const b = { type: block.type, state: clone(block.state || {}), refs: clone(block.refs || {}) };
  const out = {};
  // 1. types: per-type rows, then every-type rows (*)
  let row = A.types[b.type];
  if (!row && typeof b.type === 'string' && b.type.includes('.')) {
    const i = b.type.indexOf('.'), base = b.type.slice(0, i), rest = b.type.slice(i + 1);
    if (A.types[base] && !A.types[base].retired) row = { ...A.types[base], kind: rest };      // GUESS: place.x -> thing, kind x
    else if (base in P.types) row = { type: base, kind: rest };                              // GUESS: observe.x -> observe, kind x
  }
  for (const r of [row, A.types['*']].filter(Boolean)) {
    if (r.retired) return { type: b.type, state: b.state, refs: b.refs, retired: true };
    for (const [o, n] of Object.entries(r.fields || {})) if (b.state[o] !== undefined) { b.state[n] = b.state[o]; delete b.state[o]; }
    if (r.type) b.type = r.type;
    if (r.kind && b.state.kind === undefined) b.state.kind = r.kind;
    for (const [k, v] of Object.entries(r)) if (!['type', 'kind', 'fields', 'retired', 'outside'].includes(k) && b.state[k] === undefined) b.state[k] = clone(v);
  }
  // 2. shapes: type.kind, then type, then *; read again when a rule changes type or kind
  for (let guard = 0; guard < 20; guard++) {
    const lists = [];
    if (typeof b.state.kind === 'string') lists.push(A.shapes[b.type + '.' + b.state.kind]);
    lists.push(A.shapes[b.type], A.shapes['*']);
    let restart = false;
    outer: for (const list of lists.filter(Boolean)) for (const rule of list) {
      if (!whenHolds(b, rule.when)) continue;
      if (applyRule(b, rule, out)) { restart = true; break outer; }
    }
    if (!restart) break;
  }
  // 3. shared ref renames
  for (const [o, n] of Object.entries(A.refs)) if (b.refs[o] !== undefined && b.refs[n] === undefined) { b.refs[n] = b.refs[o]; delete b.refs[o]; }
  // 4. outside
  for (const [k, v] of Object.entries(b.refs)) if (typeof v === 'string' && v.startsWith(A.outside)) { (out.outside = out.outside || {})[k] = v.slice(A.outside.length); delete b.refs[k]; }
  return { type: b.type, state: b.state, refs: b.refs, ...out };
}

// ---------------------------------------------------------------- grammar helpers
const G = Object.fromEntries(Object.entries(P.grammar).map(([k, v]) => [k, new RegExp(v)]));
const isHash = s => typeof s === 'string' && G.hash.test(s);
const dim = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
function realDate(s) { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return m >= 1 && m <= 12 && d >= 1 && d <= dim(y, m); }
const isTime = s => typeof s === 'string' && G.time.test(s) && realDate(s) && +s.slice(11, 13) < 24 && +s.slice(14, 16) < 60 && +s.slice(17, 19) < 60;
const isDate = s => typeof s === 'string' && G.date.test(s) && realDate(s);
const isDuration = s => typeof s === 'string' && G.duration.test(s);
function parseDur(s) {
  const m = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(s);
  if (!m) throw new Error('bad duration ' + s);
  const n = m.slice(1).map(x => +(x || 0));
  return { Y: n[0], M: n[1], W: n[2], D: n[3], h: n[4], m: n[5], s: n[6] };
}
function addDur(iso, dur, sign = 1) { // calendar months and years, in UTC
  const d = new Date(iso), p = parseDur(dur);
  d.setUTCFullYear(d.getUTCFullYear() + sign * p.Y, d.getUTCMonth() + sign * p.M);
  return new Date(d.getTime() + sign * (((p.W * 7 + p.D) * 24 + p.h) * 3600 + p.m * 60 + p.s) * 1000).toISOString();
}
// decimals as exact rationals
function dec(s) { const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(s)); if (!m) return null; const f = m[3] || ''; return { n: BigInt(m[1] + m[2] + f), d: 10n ** BigInt(f.length) }; }
const qty = a => a && a.value !== undefined ? dec(a.value) : null;
const rNum = r => Number(r.n) / Number(r.d);
const rAdd = (a, b) => ({ n: a.n * b.d + b.n * a.d, d: a.d * b.d });
const rGe = (a, b) => a.n * b.d >= b.n * a.d;
const asList = v => v === undefined ? [] : Array.isArray(v) ? v : [v];

// ---------------------------------------------------------------- the write check (strict)
const SHARED = new Set([...P.refs.who_and_where, ...P.refs.what_and_which, ...P.refs.verbs]);
const DATE_FIELDS = P.date_fields;                      // protocol.json date_fields
const DURATION_FIELDS = ['recovery_reach', 'per', 'notice', 'wait'];
// encoding.md, Numbers: a currency is an ISO 4217 code, or an issuer's own unit { issuer, unit, decimals }.
function currencyOk(c) {
  if (typeof c === 'string') return G.currency.test(c);
  if (!c || typeof c !== 'object' || Array.isArray(c)) return false;
  const keys = P.shapes.currency_unit;
  return Object.keys(c).every(k => keys.includes(k)) && keys.every(k => k in c)
    && isHash(c.issuer) && typeof c.unit === 'string' && c.unit.trim() !== ''
    && Number.isInteger(c.decimals) && c.decimals >= 0 && c.decimals <= P.limits.decimals_max;
}

function check(block, ctx = {}) {
  const R = [], C = new Map();
  const bad = (code, msg) => { R.push(msg); C.set(msg, code); };
  check.codes = C;
  const calendarOrTime = (v, rx = G.time) => (typeof v === 'string' && rx.test(v) ? 'calendar' : 'time');
  if (!block || typeof block !== 'object' || typeof block.type !== 'string') return ['not a block'];
  const { type } = block, state = block.state || {}, refs = block.refs || {};
  if (!(type in P.types)) return [`${type} is not a FoodBlock 1.6 type`];
  // numbers and keys, everywhere
  (function walk(v, path) {
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) bad('float', `${path} is not a finite number`);
      else if (!Number.isInteger(v)) bad('float', `${path} is a float`);
      else if (v > P.integers.max || v < P.integers.min) bad('integer_range', `${path} is out of integer bounds`);
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === 'object') for (const k of Object.keys(v)) {
      if (k.normalize('NFC') !== k) bad('not_canonical', `${path} has a key not in NFC`);
      walk(v[k], `${path}.${k}`);
    }
  })({ state, refs }, '');
  for (let i = 0; i < R.length; i++) { const was = R[i]; R[i] = was.replace(/^\./, ''); if (R[i] !== was) C.set(R[i], C.get(was)); }
  let bytes = 0; try { bytes = Buffer.byteLength(canonOf(block), 'utf8'); } catch (e) { bad('not_canonical', 'not canonical: ' + e.message); }
  if (bytes > P.limits.block_bytes) bad('size_limit', `body over ${P.limits.block_bytes} bytes`);
  // schema (if held)
  const schema = refs.schema && ctx.get ? ctx.get(refs.schema) : null;
  const sroles = schema && Array.isArray(schema.state.roles) ? schema.state.roles : [];
  const sfields = schema && schema.state.fields && typeof schema.state.fields === 'object' ? Object.keys(schema.state.fields) : [];
  // refs
  for (const [k, v] of Object.entries(refs)) {
    if (!SHARED.has(k) && !sroles.includes(k)) bad('undeclared_ref', `refs.${k} is not declared`);
    if (!(isHash(v) || (Array.isArray(v) && v.every(isHash)))) bad('grammar', `refs.${k} is not a hash or a set of hashes`);
  }
  if (Array.isArray(refs.after) && refs.after.length > P.limits.after_heads) bad('after_limit', `refs.after names more than ${P.limits.after_heads} heads`);
  // fields
  const genesis = type === 'actor' && refs.author === undefined;
  const allowed = new Set([...P.fields.every, ...(P.fields[type] || []), ...sfields]);
  for (const k of Object.keys(state)) if (!allowed.has(k)) bad('undeclared_field', `state.${k} is not declared for ${type}`);
  // shapes by keys, anywhere in state
  (function shapes(v, path) {
    if (Array.isArray(v)) return v.forEach((x, i) => shapes(x, `${path}[${i}]`));
    if (!v || typeof v !== 'object') return;
    if ('unit' in v && 'value' in v && !(typeof v.value === 'string' && G.decimal.test(v.value) && typeof v.unit === 'string' && v.unit))
      bad(typeof v.value === 'string' && v.unit && !G.decimal.test(v.value) ? 'decimal' : 'shape', `${path} is an amount { value (decimal string), unit }`);
    if ('currency' in v && 'minor' in v && !(Number.isInteger(v.minor) && currencyOk(v.currency)))
      bad('shape', `${path} is money { minor (integer), currency (an ISO 4217 code, or an issuer's { issuer, unit, decimals }) }`);
    for (const k of Object.keys(v)) shapes(v[k], `${path}.${k}`);
  })(state, 'state');
  // custody, admission and limits: shapes named in protocol.json `shapes`, `channels`, and the prose of §2, §7, §10
  const moneyOk = m => m && typeof m === 'object' && !Array.isArray(m) && Number.isInteger(m.minor) && currencyOk(m.currency) && Object.keys(m).every(k => P.shapes.money.includes(k));
  if (state.deposit !== undefined) {
    const d = state.deposit;
    if (!(d && typeof d === 'object' && !Array.isArray(d) && P.shapes.deposit.every(k => k in d) && Object.keys(d).every(k => P.shapes.deposit.includes(k)) && moneyOk(d.money))) bad('shape', 'state.deposit is { money, holder }');
    else if (!isHash(d.holder)) bad('grammar', 'state.deposit.holder is an id');
  }
  if (state.limit !== undefined && !moneyOk(state.limit)) bad('shape', 'state.limit is money');
  if (state.channel !== undefined && !P.channels.includes(state.channel)) bad('shape', `state.channel is one of ${P.channels.join(', ')}`);
  if (state.custodian !== undefined && !isHash(state.custodian)) bad('grammar', 'state.custodian is an id');
  if (state.confidence !== undefined && !(typeof state.confidence === 'string' && G.confidence.test(state.confidence))) bad('grammar', 'state.confidence is a decimal string from 0 to 1');
  // times, dates, durations: top-level state, terms, scope, each line
  const homes = [['state', state], ['terms', state.terms], ['scope', state.scope],
    ...asList(state.terms && state.terms.lines).map((l, i) => [`terms.lines[${i}]`, l])];
  for (const [name, o] of homes) {
    if (!o || typeof o !== 'object' || Array.isArray(o)) continue;
    for (const f of P.time_fields) {
      if (o[f] === undefined) continue;
      const v = o[f];
      const ok = f === 'when' && v && typeof v === 'object' ? isTime(v.from) && (v.to === undefined || isTime(v.to)) : isTime(v);
      if (!ok) bad(calendarOrTime(v), `${name}.${f} is a UTC time YYYY-MM-DDTHH:MM:SS.sssZ`);
    }
    for (const f of DATE_FIELDS) if (o[f] !== undefined && !isDate(o[f])) bad(calendarOrTime(o[f], G.date), `${name}.${f} is a date YYYY-MM-DD`);
    for (const f of DURATION_FIELDS) if (o[f] !== undefined && !isDuration(o[f])) bad('time', `${name}.${f} is an ISO 8601 duration`);
  }
  // grammar of keys and hashes in state
  // identity.md, Algorithms: a key names its algorithms (defaults in protocol.json `algs`); an unknown one is refused, and a key
  // is checked against the grammar of its algorithm (a key outside the grammar of an algorithm the block names is unknown_alg).
  const signAlg = state.alg_sign === undefined ? P.algs.sign.default : state.alg_sign;
  const encAlg = state.alg_encrypt === undefined ? P.algs.encrypt.default : state.alg_encrypt;
  const signRow = P.algs.sign.known[signAlg], encRow = P.algs.encrypt.known[encAlg];
  if (state.alg_sign !== undefined && !signRow) bad('unknown_alg', `state.alg_sign names ${signAlg}, which is not known`);
  if (state.alg_encrypt !== undefined && !encRow) bad('unknown_alg', `state.alg_encrypt names ${encAlg}, which is not known`);
  if (state.alg_recovery !== undefined && !P.algs.sign.known[state.alg_recovery]) bad('unknown_alg', `state.alg_recovery names ${state.alg_recovery}, which is not known`);
  const gram = { public_key_sign: signRow && signRow.key, replaces: P.algs.sign.known[P.algs.sign.default].key, recovery_key: P.algs.sign.known[P.algs.sign.default].key, public_key_encrypt: encRow && encRow.key, nonce: 'nonce', recovery_key_hash: 'hash', counted_to: 'hash' };
  for (const [f, g] of Object.entries(gram)) if (g && state[f] !== undefined && !(typeof state[f] === 'string' && G[g].test(state[f]))) {
    const named = (f === 'public_key_sign' && state.alg_sign !== undefined) || (f === 'public_key_encrypt' && state.alg_encrypt !== undefined);
    bad(named ? 'unknown_alg' : 'grammar', `state.${f} does not match ${g}`);
  }
  if (state.manifest !== undefined && !(Array.isArray(state.manifest) && state.manifest.every(isHash))) bad('grammar', 'state.manifest is a set of hashes');
  if (state.audience !== undefined && state.audience !== 'public') {
    const a = state.audience;
    if (!(Array.isArray(a) && a.length && a.every(isHash) && a.every((x, i) => i === 0 || a[i - 1] < x))) bad('audience', 'state.audience is public or a sorted list of commitments');
  }
  // chain fields
  if (genesis) {
    for (const f of ['seq', 'prev', 'after']) if (state[f] !== undefined || refs[f] !== undefined) bad('bad_genesis', `a genesis has no ${f}`);
    for (const f of P.genesis) if (state[f] === undefined) bad('bad_genesis', `a genesis carries state.${f}`);
    if (state.audience !== undefined && state.audience !== 'public') bad('bad_genesis', 'a genesis is public');
  } else {
    for (const f of P.chain) {
      if ((f === 'author' || f === 'prev' ? refs[f] : state[f]) !== undefined) continue;
      // blocks.md: only an observe, transform or transfer may leave out `at` (a micro with no clock); every other block says when
      if (f === 'at') { if (!['observe', 'transform', 'transfer'].includes(type)) bad('at_missing', 'every block but an observe, transform or transfer carries state.at'); continue; }
      bad('bad_genesis', `every block but a genesis carries ${f === 'author' || f === 'prev' ? 'refs' : 'state'}.${f}`);
    }
    // blocks.md, Causal order: a block's `at` may not be earlier than that of a block it names in `after`, when both carry one
    if (state.at !== undefined && ctx.get) for (const h of asList(refs.after)) {
      const o = ctx.get(h);
      if (o && o.state && typeof o.state.at === 'string' && typeof state.at === 'string' && state.at < o.state.at) bad('at_before_after', `state.at is earlier than ${h}, which it names in after`);
    }
    if (state.audience === undefined) bad('bad_genesis', 'every block but a genesis carries state.audience');
    if (state.seq !== undefined && !(Number.isInteger(state.seq) && state.seq >= 1)) bad('chain', 'state.seq is a whole number from 1');
  }
  // status
  if (state.status !== undefined) {
    if (refs.answers === undefined && refs.updates === undefined) bad('status_not_answer', 'only an answer (refs.answers) or an update by the author carries a status');
    if (!P.answers.includes(state.status)) bad('bad_status', `state.status is one of ${P.answers.join(', ')}`);
    if (state.status === 'stopped') {
      const s = state.stop;
      const ok = s === 'before' || s === 'onward' || (s && typeof s === 'object' && Array.isArray(s.occurrences) && s.occurrences.every(isTime));
      if (!ok) bad('bad_status', 'a stopped answer says how far in state.stop');
    }
  }
  // promises
  if (type === 'promise') {
    const terms = state.terms || {};
    for (const k of Object.keys(terms)) if (!P.terms.includes(k)) bad('shape', `terms.${k} is not a term`);
    if (refs.answers !== undefined && refs.for === undefined) bad('deal_not_named', 'an answer or counter names its deal in refs.for');
    if (state.status === undefined && refs.updates === undefined) {
      const sides = [refs.from, refs.to].filter(Boolean), au = refs.author;
      if (!(sides.includes(au) || (refs.as && sides.includes(refs.as)) || refs.under)) bad('not_a_side', 'a promise is signed by a side (from or to), as it, or under its grant');
      const askSide = refs.to && (au === refs.to || refs.as === refs.to) && refs.from !== refs.to;
      if (askSide && terms.expires === undefined) bad('ask_without_expires', 'every ask carries terms.expires');
    }
    if (terms.lines !== undefined) {
      const lines = asList(terms.lines), ids = new Set();
      lines.forEach((l, i) => {
        for (const k of Object.keys(l || {})) if (!P.line.includes(k)) bad('shape', `terms.lines[${i}].${k} is not a line field`);
        if (typeof (l && l.id) !== 'string' || !l.id) bad('lines', `terms.lines[${i}].id is missing`);
        else if (ids.has(l.id)) bad('lines', `terms.lines[${i}].id is not unique`); else ids.add(l.id);
      });
      if (terms.price !== undefined || terms.quantity !== undefined) bad('lines', 'with lines there is no top-level price or quantity');
      const w = new Set(asList(refs.what)), lw = new Set(lines.map(l => l && l.what));
      if (w.size !== lw.size || [...w].some(x => !lw.has(x))) bad('lines', 'refs.what equals the set of the lines\' what');
    }
  }
  // grants
  if (type === 'grant') {
    const sc = state.scope;
    if (sc !== undefined) {
      for (const k of Object.keys(sc)) if (!P.scope.includes(k)) bad('shape', `scope.${k} is not a scope field`);
      if (sc.parties !== undefined && !(Array.isArray(sc.parties) && sc.parties.every(isHash))) bad('grammar', 'scope.parties is a set of hashes');
      if (sc.acts !== undefined && !(Array.isArray(sc.acts) && sc.acts.every(a => typeof a === 'string'))) bad('shape', 'scope.acts is a list');
    }
    if (P.grant_kinds.includes(state.kind) && sc && sc.until !== undefined) bad('scope_until', 'a key, member, successor or operator grant carries no scope.until');
    if (state.depth !== undefined && !(Number.isInteger(state.depth) && state.depth >= 0)) bad('shape', 'state.depth is a whole number');
    if (!P.grant_kinds.includes(state.kind) && state.status === undefined && refs.answers === undefined && refs.updates === undefined && !(sc && sc.until))
      bad('scope_until', 'a grant others act under carries scope.until');
    if (refs.parent && ctx.get) {
      const par = ctx.get(refs.parent);
      if (par) scopeSubset(state, par.state).forEach(m => bad('wider_than_parent', m));
    }
  }
  return [...new Set(R)];
}
// The strict check as the protocol states it (§Refusals): one { code, detail } per rule found, in the order of protocol.json `refusals.codes.block`.
function refusals(block, ctx = {}) {
  const details = check(block, ctx), codes = check.codes || new Map(), order = Object.keys(P.refusals.codes.block), by = new Map();
  for (const d of details) { const code = codes.get(d) || 'unknown_type'; by.set(code, [...(by.get(code) || []), d]); }
  return [...by].sort(([a], [b]) => order.indexOf(a) - order.indexOf(b)).map(([code, ds]) => ({ code, detail: ds.join('; ') }));
}
function scopeSubset(child, parent) {
  const R = [], c = child.scope || {}, p = parent.scope || {};
  const anchor = parent.at;
  for (const f of ['acts', 'parties']) {
    if (p[f] === undefined) continue;
    if (c[f] === undefined) R.push(`scope.${f} may be left out only if the parent leaves it out`);
    else if (!c[f].every(x => p[f].includes(x))) R.push(`scope.${f} is not a subset of the parent's`);
  }
  if (p.limit !== undefined) {
    if (c.limit === undefined) R.push('scope.limit may be left out only if the parent leaves it out');
    else if (c.limit.currency !== p.limit.currency || c.limit.minor > p.limit.minor) R.push('scope.limit is larger than the parent\'s');
  }
  const longer = (a, b) => addDur(anchor, a) > addDur(anchor, b);
  if (p.per !== undefined) { if (c.per === undefined) R.push('scope.per may be left out only if the parent leaves it out'); else if (longer(c.per, p.per)) R.push('scope.per is longer than the parent\'s'); }
  if (p.until !== undefined) { if (c.until === undefined) R.push('scope.until may be left out only if the parent leaves it out'); else if (c.until > p.until) R.push('scope.until is later than the parent\'s'); }
  if (p.notice !== undefined) { if (c.notice === undefined) R.push('scope.notice may be left out only if the parent leaves it out'); else if (longer(p.notice, c.notice)) R.push('scope.notice is shorter than the parent\'s'); }
  if (p.condition !== undefined) {
    const pc = asList(p.condition), cc = asList(c.condition);
    if (!pc.every(x => cc.some(y => deepEq(x, y)))) R.push('scope.condition drops a parent condition');
  }
  if ((child.depth || 0) > (parent.depth || 0) - 1) R.push('state.depth is not smaller than the parent\'s by at least one');
  return R;
}

// ---------------------------------------------------------------- a pool of blocks (one reader's node)
class Pool {
  constructor(entries = [], opts = {}) {
    this.m = new Map(); this.order = []; this.arrivals = opts.arrivals || {}; this.now = opts.now;
    this._id = new Map(); this._cp = new Map(); this._circle = new Map();
    for (const e of entries) this.add(e.block, e.signature);
  }
  add(block, signature) {
    const hash = hashOf(block);
    if (this.m.has(hash)) return hash;
    this.m.set(hash, { hash, block, signature, read: readAs(block), n: this.order.length + 1 });
    this.order.push(hash);
    return hash;
  }
  has(h) { return this.m.has(h); }
  get(h) { const e = this.m.get(h); return e ? e.read : null; }
  raw(h) { const e = this.m.get(h); return e ? e.block : null; }
  all() { return this.order.map(h => this.m.get(h)); }
  arrival(h) { return this.arrivals[h]; }
  // causal past: every block reachable through refs (named hashes count; held ones are followed)
  cp(h) {
    if (this._cp.has(h)) return this._cp.get(h);
    const seen = new Set(), stack = [h];
    while (stack.length) {
      const x = stack.pop(); const e = this.m.get(x); if (!e) continue;
      for (const v of Object.values(e.block.refs || {})) for (const y of asList(v)) if (typeof y === 'string' && !seen.has(y)) { seen.add(y); stack.push(y); }
    }
    this._cp.set(h, seen); return seen;
  }
  sees(a, b) { return this.cp(a).has(b) || this.cp(b).has(a); }
  identity(id) { if (!this._id.has(id)) this._id.set(id, foldIdentity(id, this)); return this._id.get(id); }
  counts(h) { // signed by a live key of its author and allowed by the history rule
    const e = this.m.get(h); if (!e) return false;
    const au = e.block.refs && e.block.refs.author;
    if (au === undefined) return e.block.type === 'actor' && this.identity(h).signed[h] === true;
    if (!this.m.has(au)) return false;
    return this.identity(au).counts[h] === true && !this.barred(au, h);
  }
  // Equivocations (protocol.md, Folds): the two blocks of a pair (one signing key, one seq) count for nothing in any fold,
  // and neither does any later block of the same key. The identity fold is the exception and does not ask.
  barred(au, h) {
    const id = this.identity(au), k = id.signer[h], seq = this.raw(h).state && this.raw(h).state.seq;
    if (!k || !Number.isInteger(seq)) return false;
    this._pairs = this._pairs || new Map();
    if (!this._pairs.has(au)) {
      const at = new Map(), first = new Map();
      for (const e of this.all()) {
        const b = e.block, kk = id.signer[e.hash];
        if (!kk || !b.refs || b.refs.author !== au || !Number.isInteger(b.state && b.state.seq)) continue;
        const slot = kk + '|' + b.state.seq;
        at.set(slot, new Set([...(at.get(slot) || []), e.hash]));
        if (at.get(slot).size > 1) first.set(kk, Math.min(first.has(kk) ? first.get(kk) : Infinity, b.state.seq));
      }
      this._pairs.set(au, first);
    }
    const from = this._pairs.get(au).get(k);
    return from !== undefined && seq >= from;
  }
}

// ---------------------------------------------------------------- identity fold (Who someone is)
function foldIdentity(id, pool) {
  const out = { id, signed: {}, signer: {}, counts: {}, keys: [], frozen: [], history: null, ended: false, operators: [], under: {} };
  const g = pool.raw(id), ge = pool.m.get(id);
  if (!g || g.type !== 'actor' || (g.refs || {}).author !== undefined) return out;
  const gkey = g.state.public_key_sign;
  out.signed[id] = verifyBlock(g, gkey, ge.signature);
  if (!out.signed[id]) return out;
  const is16 = g.state.recovery_key_hash !== undefined;
  const authored = pool.all().filter(e => e.block.refs && e.block.refs.author === id);
  // candidate keys
  const cands = new Set([gkey]);
  let recHash = g.state.recovery_key_hash, recReach = g.state.recovery_reach;
  for (const e of authored) {
    const s = e.block.state || {};
    if (e.block.type === 'grant' && s.kind === 'key') {
      if (s.public_key_sign && (s.alg_sign === undefined || P.algs.sign.known[s.alg_sign])) cands.add(s.public_key_sign);   // a key of an unknown algorithm verifies nothing
      if (s.recovery_key) cands.add(s.recovery_key);
      if (s.recovery_key_hash && !recHash && s.seq !== undefined) { recHash = s.recovery_key_hash; recReach = s.recovery_reach; } // an older genesis adds recovery once
    }
  }
  const recKey = [...cands].find(k => sha256(k) === recHash) || null;
  const signer = {};
  for (const e of authored) for (const k of cands) if (verifyBlock(e.block, k, e.signature)) { signer[e.hash] = k; break; }
  out.signer = signer;
  const withSeq = authored.filter(e => e.block.state && e.block.state.seq !== undefined && signer[e.hash]);
  // history
  const first16 = withSeq.filter(e => signer[e.hash] === gkey && e.block.state.seq === 1)[0] || withSeq[0];
  const open = !is16 && !first16;
  out.history = is16 ? 'none' : open ? 'open' : 'closed';
  const closed = new Set();
  if (!is16 && first16) { for (const h of pool.cp(first16.hash)) closed.add(h); for (const h of asList(first16.block.state.manifest)) closed.add(h); }
  // key chains: key -> {by, blocks by seq}
  const byKey = {};
  for (const e of withSeq) (byKey[signer[e.hash]] = byKey[signer[e.hash]] || []).push(e);
  // fixpoint over: which keys are brought in, which blocks fit chains, which are void
  let voidSet = new Set(), frozen = new Set(), keysIn = new Map(), fits = new Set(), rotations = [];
  for (let iter = 0; iter < 30; iter++) {
    const nKeys = new Map([[gkey, id]]);
    if (recKey) nKeys.set(recKey, id);
    // key grants from fitting, non-void blocks
    const kg = withSeq.filter(e => fits.has(e.hash) && !voidSet.has(e.hash) && e.block.type === 'grant' && e.block.state.kind === 'key' && e.block.refs.subject === id);
    const nRot = [];
    for (const e of kg) {
      const s = e.block.state, k = signer[e.hash];
      if (s.replaces) {
        const byRecovery = recKey && k === recKey && s.recovery_key === recKey;
        if (k !== s.replaces && !byRecovery) continue;              // rotated only by itself or the recovery key
        nRot.push({ e, old: s.replaces, recovery: !!byRecovery });
        if (s.public_key_sign && !nKeys.has(s.public_key_sign)) nKeys.set(s.public_key_sign, e.hash);
      } else if (s.public_key_sign && !nKeys.has(s.public_key_sign)) {
        if (k === recKey) {} // the recovery key signs only key grants: allowed
        nKeys.set(s.public_key_sign, e.hash);
      }
    }
    // chains
    const nFits = new Set();
    for (const [k, by] of nKeys) {
      const list = (byKey[k] || []).slice().sort((a, b) => a.block.state.seq - b.block.state.seq);
      // a chain may fork (two blocks at one seq prove a lie); each branch is followed so folds can see both
      const fitted = new Map([[by, 0]]);
      for (const e of list) {
        const ps = fitted.get(e.block.refs.prev);
        if (ps === undefined || e.block.state.seq !== ps + 1) continue;
        nFits.add(e.hash); fitted.set(e.hash, e.block.state.seq);
      }
    }
    // void: rotations
    const nVoid = new Set();
    for (const r of nRot) {
      const cnt = r.e.read.state.counted_to;          // read through aliases: last_good is an older name
      const lg = pool.raw(cnt);
      const lgSeq = lg && signer[cnt] === r.old ? lg.state.seq : 0;
      const recArr = pool.arrival(r.e.hash);
      const reachStart = r.recovery && recArr && recReach ? addDur(recArr, recReach, -1) : null;
      for (const e of byKey[r.old] || []) {
        if (e.block.state.seq <= lgSeq || e.hash === r.e.hash) continue;
        if (nRot.some(x => x.e.hash === e.hash)) continue;           // a rotation itself stands
        if (r.recovery && reachStart) {
          const arr = pool.arrival(e.hash);
          const usedBefore = pool.all().some(o => o.block.refs && o.block.refs.author !== id && pool.cp(o.hash).has(e.hash) && pool.arrival(o.hash) && pool.arrival(o.hash) < reachStart);
          if (usedBefore) continue;
          if (arr && arr < reachStart) continue;
        }
        nVoid.add(e.hash);
      }
    }
    // freezes: two rotations of one key that do not see each other, or any two key grants of one signing key at one seq
    // (protocol.md, Who someone is: Conflict, and Two blocks at one seq: "whether or not they rotate")
    const nFrozen = new Set(); let ended = false;
    const grants = kg.map(e => ({ e, k: signer[e.hash], rot: nRot.find(r => r.e.hash === e.hash) || null }));
    for (let i = 0; i < grants.length; i++) for (let j = i + 1; j < grants.length; j++) {
      const a = grants[i], b = grants[j];
      const sameSlot = a.k === b.k && a.e.block.state.seq === b.e.block.state.seq;
      const crossing = a.rot && b.rot && a.rot.old === b.rot.old && !pool.sees(a.e.hash, b.e.hash);
      if (!sameSlot && !crossing) continue;
      if (a.rot && b.rot && a.rot.recovery && b.rot.recovery && a.rot.old === b.rot.old) { ended = true; continue; }
      const key = crossing ? a.rot.old : a.k;
      for (const x of [a, b]) {
        const brought = x.e.block.state.public_key_sign;
        if (!brought) continue;
        // a recovery rotation of the same key settles the pair: the keys brought in by grants in its causal past speak
        const settled = nRot.some(r => r.recovery && r.old === key && pool.cp(r.e.hash).has(x.e.hash));
        if (!settled) nFrozen.add(brought);
      }
    }
    // void spreads: a key brought in by a void block is void, with every block it signed
    let grew = true;
    while (grew) {
      grew = false;
      for (const [k, by] of nKeys) if (nVoid.has(by)) for (const e of byKey[k] || []) if (!nVoid.has(e.hash)) { nVoid.add(e.hash); grew = true; }
    }
    const sig = [...nKeys.keys()].sort().join() + '|' + [...nFits].sort().join() + '|' + [...nVoid].sort().join() + '|' + [...nFrozen].sort().join();
    const prevSig = [...keysIn.keys()].sort().join() + '|' + [...fits].sort().join() + '|' + [...voidSet].sort().join() + '|' + [...frozen].sort().join();
    keysIn = nKeys; fits = nFits; voidSet = nVoid; frozen = nFrozen; rotations = nRot; out.ended = ended;
    if (sig === prevSig) break;
  }
  const voidKeys = new Set([...keysIn].filter(([, by]) => voidSet.has(by)).map(([k]) => k));
  out.keys = [...keysIn.keys()].filter(k => k !== recKey && !voidKeys.has(k)).sort();
  out.frozen = [...frozen].sort();
  out.recovery_key = recKey;
  // the ended identity: nothing after counts except the causal past of either crossing recovery rotation
  let endPast = null;
  if (out.ended) { endPast = new Set(); for (const r of rotations.filter(x => x.recovery)) { endPast.add(r.e.hash); for (const h of pool.cp(r.e.hash)) endPast.add(h); } }
  for (const e of authored) {
    const k = signer[e.hash];
    let ok;
    if (!k) ok = false;
    else if (e.block.state && e.block.state.seq === undefined) ok = true; // history: checked by signature only
    else ok = fits.has(e.hash) && !voidSet.has(e.hash) && !frozen.has(k) && !voidKeys.has(k) && (!endPast || endPast.has(e.hash));
    out.signed[e.hash] = ok;
    const noSeq = e.block.state && e.block.state.seq === undefined;
    out.counts[e.hash] = ok && (!noSeq || (!is16 && (open || closed.has(e.hash))));
  }
  out.counts[id] = true;
  // operators: authors of live grants of kind operator naming this id in refs.to
  for (const e of pool.all()) {
    const r = e.read;
    if (r.type === 'grant' && r.state.kind === 'operator' && r.refs.to === id && !r.refs.answers && !r.refs.updates && !stoppedByAuthor(pool, e.hash))
      if (pool.identity(r.refs.author).counts[e.hash]) out.operators.push(r.refs.author);
  }
  out.operators = [...new Set(out.operators)].sort();
  for (const e of authored) if (e.read.refs.under) out.under[e.hash] = underOk(pool, e.hash);
  return out;
}
function stoppedByAuthor(pool, gh) {
  const g = pool.get(gh);
  return pool.all().some(e => e.read.refs.updates === gh && e.read.state.status === 'stopped' && e.read.refs.author === g.refs.author && pool.counts(e.hash));
}
function actName(r) { return typeof r.state.kind === 'string' ? [r.type, r.type + '.' + r.state.kind] : [r.type]; }
function underOk(pool, h) { // signer, scope and liveness of the grant a block names in refs.under
  const b = pool.get(h), gh = b.refs.under, g = pool.get(gh);
  if (!g || g.type !== 'grant' || !pool.counts(gh)) return false;
  if (g.refs.to !== undefined && g.refs.to !== b.refs.author) return false;
  if (stoppedByAuthor(pool, gh)) return false;
  const sc = g.state.scope || {};
  if (sc.acts && !actName(b).some(a => sc.acts.includes(a))) return false;
  if (sc.until && b.state.at && b.state.at > sc.until) return false;
  if (g.refs.parent) { const fake = { refs: { under: g.refs.parent, author: g.refs.author }, state: b.state, type: b.type }; void fake; }
  return true;
}

// ---------------------------------------------------------------- circles (membership and roles)
function foldCircle(C, pool, limit = null) {
  const key = C + '|' + (limit ? limit.tag : '');
  if (pool._circle.has(key)) return pool._circle.get(key);
  const res = { members: {}, removed: [], admins: new Set() };
  pool._circle.set(key, res); // guard against cycles
  const circle = pool.get(C);
  if (!circle) return res;
  const founder = circle.refs.author;
  const inScope = h => !limit || limit.set.has(h);
  const grants = pool.all().filter(e => inScope(e.hash) && e.read.type === 'grant' && e.read.state.kind === 'member' && e.read.refs.subject === C && pool.counts(e.hash));
  const isAdminAt = (who, h) => who === founder || (foldAt(C, pool, h).members[who] || []).includes('admin');
  // records: root invitations, versions by admins, member answers
  const root = h => { let x = h, seen = new Set(); while (true) { const r = pool.get(x); if (!r || !r.refs.updates || seen.has(x)) return x; seen.add(x); x = r.refs.updates; } };
  const invites = grants.filter(e => !e.read.refs.updates && !e.read.refs.answers && e.read.refs.as === C && isAdminAt(e.read.refs.author, e.hash));
  const needed = (circle.state.removal && circle.state.removal.needed) || P.circle.removal_default.needed;
  const recs = [];
  for (const inv of invites) {
    const member = inv.read.refs.to;
    if (!member) continue; // open groups: not folded here
    const updates = grants.filter(e => e.read.refs.updates && root(e.hash) === inv.hash && e.read.refs.as === C && isAdminAt(e.read.refs.author, e.hash));
    const versions = [inv, ...updates.filter(u => u.read.state.status === undefined)].sort((a, b) => pool.cp(b.hash).has(a.hash) ? -1 : pool.cp(a.hash).has(b.hash) ? 1 : 0);
    const answers = grants.filter(e => e.read.refs.answers && e.read.refs.author === member && [inv.hash, ...updates.map(u => u.hash)].includes(e.read.refs.answers));
    const stops = updates.filter(u => u.read.state.status === 'stopped');
    recs.push({ inv, member, versions, answers, stops });
  }
  // roles per record, in causal order
  for (const r of recs) {
    let held = null;
    for (const v of r.versions) {
      const yes = r.answers.find(a => a.read.refs.answers === v.hash && a.read.state.status === 'accepted');
      const roles = asList(v.read.state.roles);
      if (yes) held = roles.slice(); else if (held) held = held.filter(x => roles.includes(x));
    }
    r.held = held;
    const leave = r.answers.find(a => a.read.state.status === 'stopped');
    const firstYes = r.answers.find(a => a.read.state.status === 'accepted' && a.read.refs.answers === r.inv.hash);
    r.accepted = held !== null;
    if (r.accepted && firstYes && r.stops.some(st => pool.cp(firstYes.hash).has(st.hash))) r.accepted = false; // stopped before it was answered
    r.left = !!leave;
  }
  // removal: an admin needs N other admins; crossing admin removals go to the earlier admin grant
  const adminGrantOf = who => { const r = recs.find(x => x.member === who && (x.held || []).includes('admin')); return r ? r.inv.hash : null; };
  for (const r of recs) {
    if (!r.accepted) { r.ended = r.stops.length > 0; continue; }
    const Y = r.member, targetAdmin = (r.held || []).includes('admin');
    const removers = r.stops.filter(s => s.read.refs.author !== Y).filter(s => {
      if (!targetAdmin) return true;
      const X = s.read.refs.author;
      if (X === founder) return true;
      const crossing = recs.some(o => o.member === X && o.stops.some(t => t.read.refs.author === Y && !pool.sees(t.hash, s.hash)));
      if (!crossing) return true;
      if (Y === founder) return false;
      const gx = adminGrantOf(X), gy = adminGrantOf(Y);
      return !(gx && gy && pool.cp(gx).has(gy)); // the target's grant earlier: the target wins; neither earlier: both stand
    });
    const n = new Set(removers.map(s => s.read.refs.author)).size;
    r.removed = targetAdmin ? n >= needed : n > 0;
    r.removers = removers;
    r.ended = r.removed || r.left;
  }
  const everIn = new Set();
  for (const r of recs) {
    if (r.accepted) everIn.add(r.member);
    if (r.accepted && !r.ended) res.members[r.member] = [...new Set([...(res.members[r.member] || []), ...r.held])].sort();
  }
  if (!res.members[founder]) res.members[founder] = ['admin'];
  else if (!res.members[founder].includes('admin')) res.members[founder] = [...res.members[founder], 'admin'].sort();
  res.removed = [...everIn].filter(m => !res.members[m]).sort();
  // circles.md: the fold keeps the counted_to the stop named (null if none); the removal's, or the member's own leaving
  res.counted_to = {};
  for (const m of res.removed) {
    const r = recs.filter(x => x.member === m && x.accepted && x.ended).pop();
    const enders = r ? (r.removed ? r.removers : r.answers.filter(a => a.read.state.status === 'stopped')) : [];
    const last = enders.slice().sort((a, b) => pool.cp(b.hash).has(a.hash) ? -1 : pool.cp(a.hash).has(b.hash) ? 1 : 0).pop();
    res.counted_to[m] = (last && last.read.state.counted_to) || null;
  }
  return res;
}
function foldAt(C, pool, h) { const set = pool.cp(h); return foldCircle(C, pool, { set, tag: h }); }
function mayAct(pool, h) { // signing for a circle: a role listed in the circle's signers, in its fold at that block
  const b = pool.get(h), C = b.refs.as, c = pool.get(C);
  if (!c) return false;
  const signers = c.state.signers || P.circle.signers_default;
  const roles = foldAt(C, pool, h).members[b.refs.author] || [];
  return roles.some(r => signers.includes(r));
}
function audienceMembers(pool, h, recipient) { // members then
  const [C, role] = recipient.split('#');
  const f = foldAt(C, pool, h);
  return Object.entries(f.members).filter(([, roles]) => !role || roles.includes(role)).map(([m]) => m).sort();
}
function foldRekeys(C, pool) {
  const circle = pool.get(C);
  let epoch = 0, cur = [C], keys = [circle.state.public_key_encrypt];
  const grants = pool.all().filter(e => e.read.type === 'grant' && e.read.state.kind === 'key' && e.read.refs.subject === C && e.read.refs.as === C && Number.isInteger(e.read.state.epoch) && pool.counts(e.hash) && (foldAt(C, pool, e.hash).members[e.read.refs.author] || []).includes('admin'));
  for (;;) {
    const next = grants.filter(e => e.read.state.epoch === epoch + 1 && asList(e.read.refs.after).some(a => cur.includes(a)));
    if (!next.length) break;
    epoch++; cur = next.map(e => e.hash); keys = next.map(e => e.read.state.public_key_encrypt).sort();
  }
  return { epoch, keys };
}
function ballotCounted(pool, result, commitmentHex, counter) {
  const r = pool.get(result);
  return !!r && r.refs.author === counter && pool.counts(result) && asList(r.state.counted).includes(commitmentHex);
}
function foldSuccessor(pool, gh, now) {
  const g = pool.get(gh), person = g.refs.author, wit = asList(g.state.witnesses), needed = g.state.needed || 1;
  let events = pool.all().filter(e => e.read.type === 'observe' && e.read.refs.under === gh && wit.includes(e.read.refs.author) && pool.counts(e.hash));
  const defeats = pool.all().filter(e => e.read.refs.defeats && pool.counts(e.hash) && (e.read.refs.author === person));
  const fireOf = evs => {
    const byW = {}; for (const e of evs) { const a = pool.arrival(e.hash); if (!byW[e.read.refs.author] || a < byW[e.read.refs.author]) byW[e.read.refs.author] = a; }
    const arr = Object.values(byW).filter(Boolean).sort();
    return arr.length >= needed ? addDur(arr[needed - 1], g.state.wait || 'PT0S') : null;
  };
  for (let i = 0; i < 10; i++) {
    const fires = fireOf(events);
    const kill = defeats.filter(d => events.some(e => e.hash === d.read.refs.defeats) && (!fires || !pool.arrival(d.hash) || pool.arrival(d.hash) < fires));
    if (!kill.length) break;
    const dead = new Set(kill.map(d => d.read.refs.defeats));
    events = events.filter(e => !dead.has(e.hash));
  }
  const fires = fireOf(events);
  return { events: events.map(e => e.hash).sort(), fired: !!fires && !!now && now >= fires, fires };
}

// ---------------------------------------------------------------- things: where now, who owns
function ownerOf(pool, thing) {
  const t = pool.get(thing); if (!t) return { owner: null, conflict: null };
  let owner = t.refs.author, last = null;
  const xfers = pool.all().filter(e => e.read.type === 'transfer' && e.read.refs.what === thing && pool.counts(e.hash) && e.read.state.amount === undefined && (e.read.refs.to_owner !== undefined || e.read.state.count !== undefined));
  const accepted = x => x.read.refs.to_owner === undefined ? true :
    pool.all().some(a => a.read.refs.answers === x.hash && a.read.state.status === 'accepted' && a.read.refs.author === x.read.refs.to_owner && pool.counts(a.hash));
  for (let i = 0; i < 100; i++) {
    const c = xfers.filter(x => x.read.refs.author === owner && (!last || pool.cp(x.hash).has(last)) && accepted(x) && x.hash !== last);
    if (!c.length) break;
    const minimal = c.filter(x => !c.some(y => y !== x && pool.cp(x.hash).has(y.hash)));
    if (minimal.length > 1) return { owner, conflict: minimal.map(x => x.hash).sort() };
    const x = minimal[0];
    last = x.hash; owner = x.read.refs.to_owner === undefined ? null : x.read.refs.to_owner;
    if (owner === null) break;
  }
  return { owner, conflict: null };
}
function whereNow(pool, thing, seen = new Set()) {
  if (seen.has(thing)) return []; seen.add(thing);
  const t = pool.get(thing); if (!t) return [];
  // the owners it has had, and holders they named
  const ok = new Set([t.refs.author]);
  for (const e of pool.all()) if (e.read.type === 'transfer' && e.read.refs.what === thing) { if (e.read.refs.to_owner) ok.add(e.read.refs.to_owner); if (e.read.refs.to_holder) ok.add(e.read.refs.to_holder); }
  const moves = pool.all().filter(e => e.read.type === 'transfer' && e.read.refs.what === thing && e.read.refs.to_place && ok.has(e.read.refs.author) && pool.counts(e.hash));
  const heads = moves.filter(m => !moves.some(o => o !== m && pool.cp(o.hash).has(m.hash)));
  const places = heads.length ? heads.map(m => m.read.refs.to_place) : t.refs.place ? [t.refs.place] : [];
  const outp = new Set();
  for (const p of places) { const deeper = pool.has(p) ? whereNow(pool, p, new Set(seen)) : []; (deeper.length ? deeper : [p]).forEach(x => outp.add(x)); }
  return [...outp].sort();
}

// ---------------------------------------------------------------- promise stage
function foldPromise(pool, first, now) {
  const P0 = pool.get(first);
  const from = P0.refs.from, to = P0.refs.to, offerer = P0.refs.author;
  const out = { stage: null };
  // input: blocks naming P in for, or answering a block in the deal
  const deal = new Map();
  for (const e of pool.all()) if (e.hash !== first && asList(e.read.refs.for).includes(first) && pool.counts(e.hash)) deal.set(e.hash, e);
  let grew = true;
  while (grew) { grew = false; for (const e of pool.all()) if (!deal.has(e.hash) && e.hash !== first && (deal.has(e.read.refs.answers) || e.read.refs.answers === first) && pool.counts(e.hash)) { deal.set(e.hash, e); grew = true; } }
  const sides = new Set([from, to].filter(Boolean));
  const open = !from || !to;
  const isSide = e => sides.has(e.read.refs.author) || (e.read.refs.as && sides.has(e.read.refs.as)) || (e.read.refs.under && underOk(pool, e.hash) && sides.has(pool.get(e.read.refs.under).refs.author));
  const B = [...deal.values()];
  const kept = B.filter(e => isSide(e) || open && e.read.type === 'promise');
  const pr = kept.filter(e => e.read.type === 'promise');
  // to yourself
  const self = from && to && from === to && offerer === from;
  // live offer: P, or the latest counter between the same two sides
  let live = first, liveAuthor = offerer;
  if (!open) for (let i = 0; i < 50; i++) {
    const c = pr.find(e => e.read.state.status === undefined && e.read.refs.answers === live && e.read.refs.author !== liveAuthor && e.read.refs.from === from && e.read.refs.to === to);
    if (!c) break; live = c.hash; liveAuthor = c.read.refs.author;
  }
  out.offer = live;
  const other = liveAuthor === from ? to : from;
  const stopsBefore = pr.filter(e => e.read.state.status === 'stopped' && e.read.state.stop === 'before' && (e.read.refs.updates === live || e.read.refs.updates === first) && e.read.refs.author === liveAuthor);
  const declines = pr.filter(e => e.read.state.status === 'declined' && e.read.refs.answers === live && e.read.refs.author === other);
  let binding = null, takers = [];
  if (self) binding = first;
  else if (!open) {
    const acc = pr.filter(e => e.read.state.status === 'accepted' && e.read.refs.answers === live && e.read.refs.author === other);
    const b = acc.find(a => !stopsBefore.some(s => pool.cp(a.hash).has(s.hash)));
    if (b) binding = b.hash;
  } else {
    const requests = pr.filter(e => e.read.state.status === 'accepted' && e.read.refs.answers === first && e.read.refs.author !== offerer);
    for (const rq of requests) {
      const al = pr.find(e => e.read.state.status === 'accepted' && e.read.refs.answers === rq.hash && e.read.refs.author === offerer);
      if (!al || stopsBefore.some(s => pool.cp(al.hash).has(s.hash))) continue;
      takers.push({ who: rq.read.refs.author, request: rq.hash, allocation: al.hash, quantity: (al.read.state.terms && al.read.state.terms.quantity) || (rq.read.state.terms && rq.read.state.terms.quantity) || null });
    }
    // allocations that do not see each other prove a lie (Equivocation): neither counts, and the fold names them in `forks`
    const forked = new Set();
    for (const a of takers) for (const b of takers) if (a !== b && !pool.sees(a.allocation, b.allocation)) { forked.add(a.allocation); forked.add(b.allocation); }
    if (forked.size) { out.forks = [...forked].sort(); takers = takers.filter(t => !forked.has(t.allocation)); }
    if (takers.length) binding = takers[0].allocation;
  }
  out.takers = takers;
  const terms = (pool.get(live).state.terms) || {};
  // the quantity accepted and the total
  let qAcc = null;
  if (open && takers.length) {
    const t0 = takers.filter(t => t.quantity);
    if (t0.length) { let s = { n: 0n, d: 1n }; for (const t of t0) s = rAdd(s, qty(t.quantity)); qAcc = { value: fmtR(s), unit: t0[0].quantity.unit }; }
  } else if (binding && !self) {
    const a = pool.get(binding);
    qAcc = (a.state.terms && a.state.terms.quantity) || (terms.quantity && terms.quantity.value !== undefined ? terms.quantity : null);
  } else if (terms.quantity && terms.quantity.value !== undefined) qAcc = terms.quantity;
  out.quantity = qAcc;
  out.total = totalOf(terms, qAcc);
  // stage 3-6
  if (stopsBefore.length && !binding) { out.stage = 'stopped'; out.stop = 'before'; return out; }
  if (declines.length && !binding) { out.stage = 'declined'; return out; }
  if (!binding) {
    if (now && terms.expires && now > terms.expires) out.stage = 'expired';
    else out.stage = liveAuthor === from ? 'offered' : liveAuthor === to ? 'asked' : 'offered';
    return out;
  }
  out.stage = 'accepted'; out.accept = binding;
  // counted blocks (Settling)
  const schema = P0.refs.schema ? pool.get(P0.refs.schema) : null;
  const confirmers = schema && schema.state.grounds ? asList(schema.state.grounds.confirmers) : [];
  const answeredBy = (x, who) => B.some(a => a.read.refs.answers === x.hash && a.read.state.status === 'accepted' && a.read.refs.author === who);
  const confirmed = x => confirmers.length && pool.all().some(c => c.read.refs.confirms === x.hash && confirmers.includes(c.read.refs.author) && pool.counts(c.hash));
  const settle = kept.filter(e => !e.read.refs.answers && !e.read.refs.updates && e.read.type !== 'promise');
  const counted = settle.filter(x => {
    if (x.read.type === 'transfer') {
      const R = x.read.refs.to_owner || x.read.refs.to_holder;
      if (R) return answeredBy(x, R) || confirmed(x);
      return x.read.state.count !== undefined && x.read.refs.author === offerer; // open receiver: the sequencer signs
    }
    const recv = x.read.refs.author === from ? to : from;
    return answeredBy(x, recv) || confirmed(x);
  });
  // occurrences stopped
  const occ = pr.filter(e => e.read.state.status === 'stopped' && e.read.state.stop && typeof e.read.state.stop === 'object').flatMap(e => asList(e.read.state.stop.occurrences));
  if (occ.length) out.stopped = [...new Set(occ)].sort();
  // lines and money
  const kindOf = h => { const t = pool.get(h); return t && t.refs.kind ? t.refs.kind : h; };
  const lines = terms.lines ? terms.lines.map(l => ({ id: l.id, what: l.what, quantity: l.quantity })) : [{ id: null, what: P0.refs.what, quantity: qAcc }];
  const moneyIn = counted.filter(x => x.read.type === 'transfer' && x.read.state.money);
  const share = x => { const sp = asList(x.read.state.split).find(s => s.for === first); return sp ? sp.money.minor : asList(x.read.refs.for).length > 1 ? 0 : x.read.state.money.minor; };
  // promises.md / folds.md: money counts only in the price's own currency (else the first payment's); currencies are never mixed
  const toFrom = moneyIn.filter(x => x.read.refs.to_owner === from);
  const own = out.total ? out.total.currency : toFrom.length ? toFrom[0].read.state.money.currency : null;
  const sameCur = x => own === null || deepEq(x.read.state.money.currency, own);
  let paid = 0;
  for (const x of toFrom) if (sameCur(x)) paid += share(x);
  out.paid = { minor: paid, currency: own || 'GBP' };
  out.lines = lines.map(l => {
    let moved = { n: 0n, d: 1n };
    for (const x of counted) if (x.read.type === 'transfer' && !x.read.state.money && (x.read.refs.to_owner === to || x.read.refs.to_holder === to) && l.what && (x.read.refs.what === l.what || kindOf(x.read.refs.what) === l.what) && (l.id === null || x.read.state.line === l.id))
      moved = rAdd(moved, x.read.state.amount ? qty(x.read.state.amount) : { n: 1n, d: 1n });
    const need = l.quantity ? qty(l.quantity) : { n: 1n, d: 1n };
    return { id: l.id, needed: rNum(need), moved: rNum(moved), _ok: rGe(moved, need) };
  });
  if (counted.length) out.stage = 'underway';
  // done
  const work = counted.filter(x => x.read.type === 'observe' && x.read.state.kind === 'work');
  let goodsOk = true, jobOk = true;
  if (P0.refs.what !== undefined || terms.lines) goodsOk = out.lines.every(l => l._ok);
  else if (P0.state.what !== undefined) {
    if (terms.quantity && terms.quantity.value !== undefined) { let s = { n: 0n, d: 1n }; for (const w of work) if (w.read.state.amount) s = rAdd(s, qty(w.read.state.amount)); jobOk = rGe(s, qty(terms.quantity)); }
    else jobOk = work.length > 0;
  }
  const moneyOk = !out.total || paid >= out.total.minor;
  const done = counted.length > 0 && goodsOk && jobOk && moneyOk;
  if (done) out.stage = 'done';
  for (const l of out.lines) delete l._ok;
  // stopped onward
  const onward = pr.find(e => e.read.state.status === 'stopped' && e.read.state.stop === 'onward' && (e.read.refs.answers === first || e.read.refs.answers === live || e.read.refs.updates === first || e.read.refs.updates === live));
  if (onward) { out.stage = 'stopped'; out.stop = 'onward'; out.stopped_by = onward.hash; }
  // reversed
  if (done) {
    let back = 0; for (const x of moneyIn) if (x.read.refs.to_owner === to) back += share(x);
    if (paid > 0 && back >= paid) out.stage = 'reversed';
  }
  return out;
}
function fmtR(r) { // exact decimal string of a rational with a power-of-ten denominator
  let d = r.d, n = r.n, s = 0; while (d > 1n) { if (d % 10n) break; d /= 10n; s++; }
  if (d !== 1n) return String(rNum(r));
  if (!s) return String(n);
  const neg = n < 0n, a = (neg ? -n : n).toString().padStart(s + 1, '0');
  return (neg ? '-' : '') + a.slice(0, -s) + '.' + a.slice(-s).replace(/0+$/, '') .replace(/\.$/, '');
}
function totalOf(terms, qAcc) {
  const priceOf = (price, q) => {
    if (!price) return null;
    if (price.minor !== undefined) return { minor: price.minor, currency: price.currency };
    if (price.money && price.per && q) {
      const m = BigInt(price.money.minor), per = dec(price.per.value), qq = qty(q);
      const num = m * qq.n * per.d, den = qq.d * per.n;
      // rounded to the nearest minor unit, halves up (promises.md): floor(num/den + 1/2)
      const two = 2n * num + den, twoDen = 2n * den, whole = two / twoDen, rounded = (two % twoDen !== 0n && two < 0n) ? whole - 1n : whole;
      return { minor: Number(rounded), currency: price.money.currency };
    }
    return null;
  };
  if (terms.lines) {
    let s = 0, cur = null;
    for (const l of terms.lines) { const p = priceOf(l.price, l.quantity); if (p && (cur === null || deepEq(p.currency, cur))) { s += p.minor; cur = p.currency; } }   // never across currencies: the first line's
    return cur ? { minor: s, currency: cur } : null;
  }
  return priceOf(terms.price, qAcc);
}

// ---------------------------------------------------------------- the node: accept (push), pull, signed answers
function acceptIncoming(pool, h) { // the history rule on push; signature and shape checked elsewhere
  const b = pool.raw(h);
  if (!b) return { refused: 'not held' };
  const au = b.refs && b.refs.author;
  if (b.state && b.state.seq === undefined && au) {
    const g = pool.raw(au);
    if (g && g.state.recovery_key_hash !== undefined) return { refused: 'a block without seq from an identity with a 1.6 genesis' };
    const id = pool.identity(au);
    if (id.history === 'closed' && !id.counts[h]) return { refused: 'a block without seq outside the closed history' };
    if (!id.signed[h]) return { refused: 'not signed by a live key of its author' };
    return { taken: true, history: true };
  }
  return pool.counts(h) ? { taken: true } : { refused: 'not signed by a live key of its author' };
}
function headerOf(block, hash) { return { author: block.refs.author, seq: block.state.seq, prev: block.refs.prev, hash }; }
// aliases.json `messages`: older field names of a message read as today's (asker, pusher -> signer); the signature covers the bytes as sent
function readMessage(kind, m) {
  const out = { ...m };
  for (const [o, n] of Object.entries((A.messages || {})[kind] || {})) if (out[o] !== undefined && out[n] === undefined) { out[n] = out[o]; delete out[o]; }
  return out;
}
function signMsg(m, privHex) { return { ...m, signature: signStr(canonMsg(m), privHex) }; }
function verifyMsg(m, pubHex) { return verifyStr(canonMsg(m), pubHex, m.signature); }
function liveSigningKeys(pool, id) { return pool.identity(id).keys.filter(k => !pool.identity(id).frozen.includes(k)); }
function verifyBy(pool, m, id) { return liveSigningKeys(pool, id).some(k => verifyMsg(m, k)); }
// a node's store: messages in arrival order
class Node {
  constructor(holder, signPriv, pool) { this.holder = holder; this.priv = signPriv; this.pool = pool; this.store = []; this.nonces = new Set(); }
  take(message) { this.store.push({ n: this.store.length + 1, message }); }
  pull(req, opts = {}) {
    let asker = null;
    if (req.signature !== undefined) {
      if (req.node !== this.holder) throw new Error('pull is for another node');
      if (this.nonces.has(req.nonce)) throw new Error('nonce seen');
      const win = opts.window_ms || 5 * 60 * 1000;                // GUESS: "a short window" is not given
      if (!opts.now || Math.abs(new Date(req.at) - new Date(opts.now)) > win) throw new Error('at outside the window');
      const who = readMessage('signed_pull', req).signer;
      if (!verifyBy(this.pool, req, who)) throw new Error('bad pull signature');
      this.nonces.add(req.nonce); asker = who;
    }
    const f = req.filter || {}, since = req.since || 0;
    const blockOf = m => m.block || null;
    const match = s => {
      const m = s.message, b = blockOf(m), hd = m.header;
      const hash = b ? hashOf(b) : hd.hash;
      const r = b ? readAs(b) : null;
      if (f.hash && f.hash !== hash) return false;
      if (f.author && (b ? b.refs.author : hd.author) !== f.author) return false;
      if (f.type && (!r || r.type !== f.type)) return false;
      if (f.kind && (!r || r.state.kind !== f.kind)) return false;
      if (f.refs && (!r || Object.entries(f.refs).some(([k, v]) => !asList(r.refs[k]).includes(v)))) return false;
      if (f.record) { let x = hash, ok = false; for (let i = 0; i < 1000 && x; i++) { if (x === f.record) { ok = true; break; } const y = this.pool.get(x); x = y && y.refs.updates; } if (!ok) return false; }
      return true;
    };
    let hits = this.store.filter(s => s.n > since && match(s));
    if (req.heads) hits = hits.filter(s => { const h = s.message.block ? hashOf(s.message.block) : s.message.header.hash; return !hits.some(o => { const b = o.message.block ? readAs(o.message.block) : null; return b && (b.refs.prev === h || b.refs.updates === h); }); });
    const cap = Math.min(req.limit || 100, opts.cap || 100);
    hits = hits.slice(0, cap);
    const blocks = hits.map(s => {
      const m = s.message;
      if (m.envelope && !(asker && (opts.sealedFor || {})[m.header.hash] === asker)) { const { envelope, ...pub } = m; return { n: s.n, message: pub }; }
      return { n: s.n, message: m };
    });
    const ans = { node: this.holder, request: sha256(ser(req, false)), blocks, next: hits.length ? hits[hits.length - 1].n : since };
    return signMsg(ans, this.priv);
  }
}
function discovery(node, holds, speaks_for, admission, endpoints) { return { protocol: 'foodblock', version: P.version, node, holds, speaks_for, admission, endpoints }; }

// ---------------------------------------------------------------- micro: write a block into one's own chain
function genesis(signKey, { kind = 'person', at, recoveryKeyHash, reach = 'P30D', encryptKey } = {}) {
  const state = { kind, at, audience: 'public', public_key_sign: signKey.public_key_sign, recovery_key_hash: recoveryKeyHash, recovery_reach: reach };
  if (encryptKey) state.public_key_encrypt = encryptKey;
  const block = { type: 'actor', state, refs: {} };
  return { block, hash: hashOf(block), signature: signBlock(block, signKey.private_key) };
}
function write(chain, type, state, refs, ctx) { // chain: {author, head, seq, key}
  const block = { type, state: { ...state, seq: chain.seq + 1 }, refs: { ...refs, author: chain.author, prev: chain.head } };
  const reasons = check(block, ctx);
  if (reasons.length) return { refused: reasons };
  const hash = hashOf(block), signature = signBlock(block, chain.key.private_key);
  chain.seq++; chain.head = hash;
  return { block, hash, signature };
}


// ---------------------------------------------------------------- the compact form (encoding.md, "The compact form (CBOR)")
// A public block as CBOR (RFC 8949). The id is always the hash of the canonical JSON: a receiver rebuilds the block, writes its
// canonical JSON and hashes that. Writing is deterministic; reading refuses indefinite lengths, floats, tags, null, undefined,
// duplicate keys and integers outside +-(2^53 - 1), and accepts any other well-formed encoding of the same content.
const CB = P.cbor, MAXI = BigInt(P.integers.max);
const cbHead = (major, n) => { // shortest form
  const m = major << 5;
  if (n < 24n) return Buffer.from([m | Number(n)]);
  if (n < 256n) return Buffer.from([m | 24, Number(n)]);
  if (n < 65536n) { const b = Buffer.alloc(3); b[0] = m | 25; b.writeUInt16BE(Number(n), 1); return b; }
  if (n < 4294967296n) { const b = Buffer.alloc(5); b[0] = m | 26; b.writeUInt32BE(Number(n), 1); return b; }
  const b = Buffer.alloc(9); b[0] = m | 27; b.writeBigUInt64BE(n, 1); return b;
};
const cbEnc = v => { // v: {int: BigInt} | {bytes} | {text} | {array} | {map: [[k, v]]} | {bool}
  if ('int' in v) return v.int >= 0n ? cbHead(0, v.int) : cbHead(1, -1n - v.int);
  if ('bytes' in v) return Buffer.concat([cbHead(2, BigInt(v.bytes.length)), v.bytes]);
  if ('text' in v) { const b = Buffer.from(v.text, 'utf8'); return Buffer.concat([cbHead(3, BigInt(b.length)), b]); }
  if ('array' in v) return Buffer.concat([cbHead(4, BigInt(v.array.length)), ...v.array.map(cbEnc)]);
  if ('bool' in v) return Buffer.from([v.bool ? 0xf5 : 0xf4]);
  if ('raw' in v) return v.raw;
  const pairs = v.map.map(([k, x]) => [cbEnc(k), cbEnc(x)]);
  pairs.sort((a, b) => a[0].length - b[0].length || Buffer.compare(a[0], b[0])); // encoded keys, length first, then bytewise
  for (let i = 1; i < pairs.length; i++) if (pairs[i][0].equals(pairs[i - 1][0])) throw new Error('cbor: duplicate key');
  return Buffer.concat([cbHead(5, BigInt(pairs.length)), ...pairs.flatMap(([k, x]) => [k, x])]);
};
const cbTokens = pat => pat.split('.').flatMap(t => t.endsWith('[]') ? [t.slice(0, -2), '[]'] : [t]);
function cbMatch(pat, path) { // a pattern of protocol.json cbor.bytes against the path of a value ('[]' for each array step)
  const p = cbTokens(pat), q = p.includes('[]') ? path : path.filter(t => t !== '[]'); // every value under refs.*, arrays included
  return p.length === q.length && p.every((t, i) => t === '*' || t === q[i]);
}
function cbKind(path) {
  for (const [kind, list] of [['hash', CB.bytes.hash], ['sign', CB.bytes.sign_key], ['enc', CB.bytes.encrypt_key], ['nonce', CB.bytes.nonce]]) if (list.some(pat => cbMatch(pat, path))) return kind;
  return null;
}
const SPKI = Buffer.from(P.algs.sign.known[P.algs.sign.default].spki_prefix, 'hex');
const timePlace = path => { const j = path.join('.'); return j === 'state' || j === 'state.terms' || j === 'state.scope' || j === 'state.terms.lines.[]'; };
function cbOut(v, path, short) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'boolean') return { bool: v };
  if (typeof v === 'number') {
    if (!Number.isInteger(v) || Math.abs(v) > P.integers.max) throw new Error('cbor: ' + path.join('.') + ' is not an integer in range');
    return { int: BigInt(v) };
  }
  if (typeof v === 'string') {
    const t = v.normalize('NFC'), kind = cbKind(path);
    if (kind === 'hash' && G.hash.test(t)) return { bytes: Buffer.from(t, 'hex') };
    if (kind === 'sign' && G.sign_key.test(t)) return { bytes: Buffer.from(t, 'hex').subarray(SPKI.length) };
    if (kind === 'enc' && G.encrypt_key.test(t)) return { bytes: Buffer.from(t, 'hex') };
    if (kind === 'nonce' && G.nonce.test(t)) return { bytes: Buffer.from(t, 'hex') };
    return { text: t };
  }
  if (Array.isArray(v)) return { array: v.map(x => cbOut(x, [...path, '[]'], short)).filter(x => x !== null) };
  const key = k => short && CB.keys.includes(k) ? { int: BigInt(CB.keys.indexOf(k)) } : { text: k };
  const here = timePlace(path);
  return { map: Object.entries(v).map(([k, x]) => {
    const p = [...path, k];
    let val;
    if (path.length === 0 && k === 'type' && short && P.types[x] !== undefined) val = { int: BigInt(Object.keys(P.types).indexOf(x)) };
    else if (here && P.time_fields.includes(k) && typeof x === 'string' && G.time.test(x)) val = { int: BigInt(Date.parse(x)) };
    else if (here && k === 'when' && x && typeof x === 'object' && !Array.isArray(x))
      val = { map: Object.entries(x).map(([wk, wv]) => [key(wk), (wk === 'from' || wk === 'to') && typeof wv === 'string' && G.time.test(wv) ? { int: BigInt(Date.parse(wv)) } : cbOut(wv, [...p, wk], short)]) };
    else val = cbOut(x, p, short);
    return val === null ? null : [key(k), val];
  }).filter(Boolean) };
}
function cborEncode(block, { short = false } = {}) { // the message [t, block, signature]
  const body = cbOut({ type: block.type, state: block.state, refs: block.refs }, [], short);
  return cbEnc({ array: [{ int: BigInt(short ? CB.table : 0) }, body, { bytes: Buffer.from(block.signature, 'hex') }] });
}
function cbRead(buf) { // one well-formed item; refuses what the spec says a reader refuses
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
    if (major === 0) { const n = arg(); if (n > MAXI) throw new Error('cbor: integer out of range'); return { int: n }; }
    if (major === 1) { const n = arg(); if (n >= MAXI) throw new Error('cbor: integer out of range'); return { int: -1n - n }; }
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
function cbIn(v, path, short) {
  if ('bool' in v) return v.bool;
  if ('int' in v) return Number(v.int);
  if ('text' in v) return v.text;
  if ('array' in v) return v.array.map(x => cbIn(x, [...path, '[]'], short));
  if ('bytes' in v) {
    const kind = cbKind(path), b = v.bytes;
    if (kind === 'hash' && b.length === 32) return b.toString('hex');
    if (kind === 'sign') return (b.length === 32 ? Buffer.concat([SPKI, b]) : b).toString('hex');
    if (kind === 'enc' && b.length === 32) return b.toString('hex');
    if (kind === 'nonce' && b.length === 16) return b.toString('hex');
    throw new Error('cbor: a byte string where the protocol has none: ' + path.join('.'));
  }
  const here = timePlace(path), out = {};
  const name = k => 'text' in k ? k.text : 'int' in k && k.int >= 0n && Number(k.int) < CB.keys.length ? CB.keys[Number(k.int)] : (() => { throw new Error('cbor: a key outside the table'); })();
  for (const [k, x] of v.map) {
    const n = name(k);
    if (n in out) throw new Error('cbor: duplicate key');
    const p = [...path, n];
    if (path.length === 0 && n === 'type' && 'int' in x) out[n] = Object.keys(P.types)[Number(x.int)];
    else if (here && P.time_fields.includes(n) && 'int' in x) out[n] = new Date(Number(x.int)).toISOString();
    else if (here && n === 'when' && 'map' in x) {
      const w = {};
      for (const [wk, wv] of x.map) { const wn = name(wk); if (wn in w) throw new Error('cbor: duplicate key'); w[wn] = (wn === 'from' || wn === 'to') && 'int' in wv ? new Date(Number(wv.int)).toISOString() : cbIn(wv, [...p, wn], short); }
      out[n] = w;
    } else out[n] = cbIn(x, p, short);
  }
  return out;
}
function cborDecode(buf) { // -> { hash, type, state, refs, signature }; the id is the hash of the rebuilt canonical JSON
  const m = cbRead(Buffer.from(buf));
  if (!('array' in m) || m.array.length !== 3 || !('int' in m.array[0]) || !('map' in m.array[1]) || !('bytes' in m.array[2])) throw new Error('cbor: a message is [t, block, signature]');
  const t = Number(m.array[0].int);
  if (t !== 0 && t !== CB.table) throw new Error('cbor: a key table this reader does not have');
  if (m.array[2].bytes.length !== 64) throw new Error('cbor: a signature is 64 bytes');
  const b = cbIn(m.array[1], [], t !== 0);
  if (Object.keys(b).sort().join() !== 'refs,state,type') throw new Error('cbor: a block is { type, state, refs }');
  return { hash: hashOf(b), ...b, signature: m.array[2].bytes.toString('hex') };
}
function cborHeader(h, { short = false } = {}) { // a chain header { author, seq, prev, hash }: ids as bytes
  const key = k => short && CB.keys.includes(k) ? { int: BigInt(CB.keys.indexOf(k)) } : { text: k };
  return cbEnc({ map: ['author', 'seq', 'prev', 'hash'].map(k => [key(k), k === 'seq' ? { int: BigInt(h.seq) } : { bytes: Buffer.from(h[k], 'hex') }]) });
}
function cborEncodePush(blocks, o) { return cbEnc({ array: blocks.map(b => ({ raw: cborEncode(b, o) })) }); }

module.exports = { P, A, ser, canonical, canonOf, hashOf, sha256, canonMsg, signStr, verifyStr, signBlock, verifyBlock, newSigningKey,
  commitment, randHex, seal, openEnvelope, readAs, check, refusals, scopeSubset, Pool, foldIdentity, foldCircle, foldAt, mayAct, audienceMembers,
  foldRekeys, ballotCounted, foldSuccessor, ownerOf, whereNow, foldPromise, acceptIncoming, headerOf, signMsg, verifyMsg, Node, discovery,
  genesis, write, addDur, isTime, deepEq, underOk, readMessage, cborEncode, cborDecode, cborEncodePush, cborHeader };
