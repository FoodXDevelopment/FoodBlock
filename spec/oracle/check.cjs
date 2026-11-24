'use strict';
// The oracle's part for the strict check, valid and read (core.md, sections 3, 7 and 8).
const Basics = require('./basics.cjs');
const Bytes = require('./bytes.cjs');
const Circles = require('./circles.cjs');
const Consent = require('./consent.cjs');
const Deals = require('./deals.cjs');
const Grants = require('./grants.cjs');
const Identity = require('./identity.cjs');
const Things = require('./things.cjs');
// ================================================================ the strict check (canonical.md, core.md sections 3, 7, 8)
const RX = Object.fromEntries(Object.entries(Basics.P.grammar).filter(([, v]) => typeof v === 'string' && v.startsWith('^')).map(([k, v]) => [k, new RegExp(v)]));
// a decimal names at most limits.decimal_digits digits (core.md section 3)
{ const rx = RX.decimal; RX.decimal = { test: s => typeof s === 'string' && (s.match(/[0-9]/g) || []).length <= Basics.P.limits.decimal_digits && rx.test(s) }; }
// how deep a value nests: a scalar 0, an object or array one more than its deepest item
const depthOf = v => (v !== null && typeof v === 'object' ? 1 + Math.max(0, ...Object.values(v).map(depthOf)) : 0);
// the known hash names (core.md, Suites): the prefix of the hash of each suite a reader can use (a row of suites with a hash; the future suite has none)
const KNOWN_HASH_PREFIX = Object.values(Basics.P.suites).filter(x => Basics.isObj(x) && Basics.isStr(x.hash)).map(x => Basics.P.hashes[x.hash] && Basics.P.hashes[x.hash].prefix).filter(x => typeof x === 'string');
const CLOSED = new Set(Basics.P.closed_types);
const SHARED_REFS = new Set([...Basics.P.refs.who_and_where, ...Basics.P.refs.what_and_which, ...Basics.P.verbs, ...Basics.P.causal]);
const STATUSES = new Set(Basics.P.statuses);
const FIELDS_EVERY = new Set(Basics.P.fields.every);
FIELDS_EVERY.add('counted_to'); // a block signed by those who may speak for the line's owner names in `state.counted_to` the last block of the old line that counts
FIELDS_EVERY.add('rule_set'); // `state.rule_set` is a field of every type (protocol.json `fields.every` adds it)
// A type's own base fields, and the key fields (defined once) for an actor and a grant.
// a table of protocol.json (or one built from it) read at a name a block wrote: only the table's own entries, never what every object carries
// (`constructor`, `toString`: legal type names)
const tableEntry = (table, name) => (Basics.isObj(table) && Basics.isStr(name) && Object.hasOwn(table, name) ? table[name] : undefined);
const baseFields = type => [...(tableEntry(Basics.P.fields, type) || []), ...(Basics.P.key_fields.on.includes(type) ? Basics.P.key_fields.fields : [])];
// days in a month of the proleptic Gregorian calendar, by integers (JavaScript's Date.UTC reads the years 0 to 99 as 1900 to 1999)
const dim = (y, m) => m === 2 ? ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31;
function realDate(s) { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return m >= 1 && m <= 12 && d >= 1 && d <= dim(y, m); }
const realTime = s => realDate(s) && +s.slice(11, 13) < 24 && +s.slice(14, 16) < 60 && +s.slice(17, 19) < 60;
const lonePair = s => { for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); if (c >= 0xd800 && c <= 0xdbff) { const d = s.charCodeAt(i + 1); if (d >= 0xdc00 && d <= 0xdfff) { i++; continue; } return true; } if (c >= 0xdc00 && c <= 0xdfff) return true; } return false; };
const MAXI = Basics.P.integers.max;

// A check returns findings { code, detail, stage }. Stage = the number in core.md section 8. "The first failure is the refusal" is read as
// "report the findings of the first stage that fails" (several codes of one stage are all listed, in the list's order); core.md also says a block that
// fails several checks gets one refusal per check, and the vectors (a bad currency on a transfer with no refs.what gives only shape) fit the first reading (the text does not say; read so).
function blockMap(h) {
  if (!h) return new Map();
  if (h instanceof Map) return h;
  if (Array.isArray(h)) return new Map(h.filter(Boolean).map(b => [b.hash, b]));
  return new Map();
}
const asList = v => v === undefined ? [] : Array.isArray(v) ? v : [v];
// A deal's lines (promises.md, Terms, A deal is its lines): terms.lines, each an object; none where the terms state no list.
const linesOf = terms => (Basics.isObj(terms) && Array.isArray(terms.lines) ? terms.lines.filter(Basics.isObj) : []);
// A line's quantity chosen (folds.md, What is left): what an answer's terms.lines names for the line's id, else the line's own quantity where that
// is an amount (a range is what may be chosen, never a choice).
const quantityOf = (line, chosen) => {
  const named = Array.isArray(chosen) ? chosen.find(c => Basics.isObj(c) && c.id !== undefined && c.id === line.id) : undefined;
  if (named && Basics.isObj(named.quantity) && named.quantity.value !== undefined) return named.quantity;
  return Basics.isObj(line.quantity) && line.quantity.value !== undefined ? line.quantity : undefined;
};
// What a block moves or names to move (promises.md, What moves): a promise's lines' what, any other block's refs.what.
const whatsOf = b => (b && b.type === 'promise' ? linesOf(b.state && b.state.terms).map(l => l.what).filter(Basics.isStr) : asList(b && b.refs && b.refs.what));
// An id: a bare 64-hex (SHA-256) or a known hash name and colon in front.
function idProblem(s) {
  if (!Basics.isStr(s)) return 'grammar';
  const m = /^([a-z0-9-]+):(.*)$/.exec(s);
  if (m) { if (!KNOWN_HASH_PREFIX.includes(m[1] + ':')) return RX.id.test(s) ? 'unknown_suite' : 'grammar'; return /^[0-9a-f]{64}$/.test(m[2]) ? null : 'grammar'; }
  return RX.hash.test(s) ? null : 'grammar';
}
const timeProblem = s => !Basics.isStr(s) || !RX.time.test(s) ? 'time' : (!realTime(s) ? 'calendar' : null);
const dateProblem = s => !Basics.isStr(s) || !RX.date.test(s) ? 'time' : (!realDate(s) ? 'calendar' : null);
const durationProblem = s => !Basics.isStr(s) || !RX.duration.test(s) ? 'time' : null;

const has = (o, ...ks) => ks.every(k => k in o);
// An amount { value, unit }, a price (money, or money per unit { money, per }) and a quantity (an amount, or a range { min, max }
// only under a per-unit price) at the places a promise's terms and lines name them (promises.md, Terms). Each returns a code, or null.
// An amount (encoding.md, Shapes): { value, unit } or { value, unit, of }; `of` an id. noOf: beside refs.what and as a thing's pack an amount carries no `of` (shape).
const amountProblem = (a, noOf) => {
  if (a === undefined) return null;
  if (!Basics.isObj(a) || Object.keys(a).some(k => !Basics.P.shapes.amount.includes(k) && !Basics.P.shapes.amount_optional.includes(k)) || !Basics.isStr(a.value) || !Basics.isStr(a.unit) || a.unit === '') return 'shape';
  if ('of' in a && (noOf || !Basics.isStr(a.of) || idProblem(a.of))) return 'shape';
  return RX.decimal.test(a.value) ? null : 'decimal';
};
const perUnit = p => Basics.isObj(p) && 'per' in p;
// a panel (promises.md, Conditions): { names, needed }, names a non-empty list of ids each once (their order is kept), needed how many different ones must each sign; a panel of one needs none,
// one of more names that states none holds nothing. Returns { names, needed }, or null when it is written wrong or holds nothing.
function panelOf(v, ok) {
  if (!Basics.isObj(v) || Object.keys(v).some(k => k !== 'names' && k !== 'needed')) return null;
  if (!(Array.isArray(v.names) && v.names.length && v.names.every(ok) && new Set(v.names).size === v.names.length)) return null;
  if (v.needed === undefined) return v.names.length === 1 ? { names: v.names, needed: 1 } : null;
  return Number.isInteger(v.needed) && v.needed >= 1 ? { names: v.names, needed: v.needed } : null;
}
// a price fixed later (promises.md, Terms): { figure, by, deadline, clocks }, by a panel, and optionally fraction, min, max
const figureKeys = p => Basics.isObj(p) && 'figure' in p && Basics.P.shapes.price_figure.every(k => k in p) && Object.keys(p).every(k => Basics.P.shapes.price_figure.includes(k) || Basics.P.shapes.price_figure_optional.includes(k));
function figureProblems(p) {
  const out = [];
  if (!figureKeys(p)) out.push('shape');
  if (!(Basics.isStr(p.figure) && p.figure !== '')) out.push('shape');
  if (panelOf(p.by, x => Basics.isStr(x) && RX.id.test(x)) === null) out.push('shape');
  const t = timeProblem(p.deadline); if (t) out.push(t);
  if (Identity.clocksOf(p.clocks) === null) out.push('shape');
  if ('fraction' in p && !(Basics.isStr(p.fraction) && RX.decimal.test(p.fraction) && Deals.decCmp(p.fraction, '0') >= 0 && Deals.decCmp(p.fraction, '1') <= 0)) out.push('shape');
  for (const k of ['min', 'max']) if (k in p) { const c = amountProblem(p[k]); if (c) out.push(c); }
  return out;
}
function priceProblems(p) {
  const out = [];
  if (p === undefined) return out;
  if (Basics.isObj(p) && 'figure' in p) return figureProblems(p);
  if (Basics.isObj(p) && !perUnit(p) && shapeOf(p) === 'amount') { const c = amountProblem(p); return c ? [c] : []; }
  if (perUnit(p)) {
    if (Object.keys(p).some(k => !Basics.P.shapes.price_per.includes(k))) out.push('shape');
    if (p.amount === undefined) out.push('shape'); else { const c = amountProblem(p.amount); if (c) out.push(c); }
    const c = amountProblem(p.per); if (c) out.push(c);
    return out;
  }
  return ['shape'];
}
function quantityProblems(q, price) {
  const out = [];
  if (q === undefined) return out;
  if (!(Basics.isObj(q) && (q.min !== undefined || q.max !== undefined))) { const c = amountProblem(q); return c ? [c] : []; }
  if (!perUnit(price)) out.push('shape');
  if (Object.keys(q).some(k => !Basics.P.shapes.range.includes(k))) out.push('shape');
  for (const e of ['min', 'max']) { if (!(e in q)) continue; const c = amountProblem(q[e]); if (c) out.push(c); }
  if (Basics.isObj(q.min) && Basics.isObj(q.max) && q.min.unit === q.max.unit && Deals.decCmp(q.min.value, q.max.value) > 0) out.push('shape');
  return out;
}
// Shapes are read at the places protocol.json gives them (shapes.places), never by a field name deeper in (encoding.md, Shapes). An object whose keys
// are exactly a shape's is that shape, and is checked as one, in any field; an object with any other keys is data. A shape's own parts are read as it says.
// a place (things.md): a point { lat, lon } in WGS84 degrees, or an area, a point with a radius in m
const deg = (x, lim) => Basics.isStr(x) && RX.decimal.test(x) && Deals.decCmp(x.replace(/^-/, ''), lim) <= 0;
const whereOk = w => Basics.isObj(w) && Object.keys(w).every(k => Basics.P.shapes.where.area.includes(k)) && deg(w.lat, '90') && deg(w.lon, '180') && (w.radius === undefined || (Basics.isObj(w.radius) && !amountProblem(w.radius) && w.radius.unit === 'm'));
const SHAPES = [['amount', Basics.P.shapes.amount], ['amount', [...Basics.P.shapes.amount, ...Basics.P.shapes.amount_optional]], ['price_per', Basics.P.shapes.price_per], ['range', Basics.P.shapes.range], ['mark', Basics.P.shapes.mark], ['input', Basics.P.shapes.input], ['point', Basics.P.shapes.where.point], ['area', Basics.P.shapes.where.area], ['bound', Basics.P.shapes.bound]];
const shapeOf = v => { if (!Basics.isObj(v)) return null; if ('figure' in v) return figureKeys(v) ? 'price_figure' : null; const ks = Object.keys(v); const hit = SHAPES.find(([, keys]) => keys.length === ks.length && keys.every(k => ks.includes(k))); return hit ? hit[0] : null; };
function shapeValue(v, out, key) {
  if (Array.isArray(v)) { v.forEach(x => shapeValue(x, out, key)); return; }
  const bad = c => c && out.push({ code: c, detail: 'shape at ' + key });
  switch (shapeOf(v)) {
    case 'amount': bad(amountProblem(v)); break;
    case 'price_per': priceProblems(v).forEach(bad); break;
    case 'price_figure': figureProblems(v).forEach(bad); break;
    case 'range': quantityProblems(v, { per: {} }).forEach(bad); break;
    case 'mark': if (!Basics.isStr(v.scheme) || !Basics.isStr(v.value)) bad('shape'); break;
    case 'input': bad(idProblem(v.from)); bad(amountProblem(v.amount)); break;
    case 'point': case 'area': if (!whereOk(v)) bad('shape'); break;
    case 'bound': if (Things.ringOf(v) === null) bad('shape'); break;
    default:
  }
}
// what a promise or a transfer moves is never below zero (encoding.md, Shapes): every amount at a place, a range's ends, a price's per
function amountsBelowZero(container, out, key) {
  if (!Basics.isObj(container)) return;
  const pl = Basics.P.shapes.places, below = a => Basics.isObj(a) && Basics.isStr(a.value) && RX.decimal.test(a.value) && Deals.decCmp(a.value, '0') < 0;
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
  if (!Basics.isObj(container)) return;
  const pl = Basics.P.shapes.places;
  for (const [k, x] of Object.entries(container)) {
    if (pl.data.includes(k)) continue; // not a place: a schema's fields, grounds and roles are data (encoding.md, Shapes)
    if (Grants.isRL(x)) { // a range { min, max } or a list { one_of } sits only at the places item 6 of Keeps to names
      if ((/(^|\.)terms$/.test(key) && Basics.P.set_places.includes('terms.' + k)) || (/\.lines$/.test(key) && Basics.P.set_places.includes('lines.' + k))) { const q = Grants.rangeListProblem(x); if (q) out.push({ code: q, detail: 'range or list at ' + key + '.' + k }); }
      else out.push({ code: 'shape', detail: 'a range or a list outside its places at ' + key + '.' + k });
      continue;
    }
    if (k === 'ends_on') continue; // a grant's `scope.ends_on` has its own shape (protocol.json shapes.ends_on), read by the grant's scope check
    if (Basics.BARE_FIELDS.includes(k) && shapeOf(x) === null) out.push({ code: 'shape', detail: 'a bare field holds exactly one shape at ' + key + '.' + k });
    shapeValue(x, out, key + '.' + k);
    if (pl.containers.includes(k)) shapeFindings(x, out, key + '.' + k);
    else if (pl.lists.includes(k) && Array.isArray(x)) x.forEach(i => shapeFindings(i, out, key + '.' + k));
  }
}

// Her list of voices and her clock, as written (identity.md, Her voices; protocol.json shapes.voice and clocks). A voice is exactly one of `key`, `key_hash`, `names` with its
// own optional fields; the first is a key or a key_hash; each key, key_hash and id once in all; a list that states a wait above zero, or any reach, states clocks.
// An empty list is a key grant that ends the identity (identity.md, Her voices).
const TERMS_1_9 = ['waits_on', 'in_hand', 'step']; // terms the set names (protocol.json terms lists them when the text lands)
const VOICE_FIELDS_1_9 = ['receives', 'passes', 'above', 'each', 'limit', 'every']; // a key voice may state `each`, `limit` and, with `limit`, `every`; // `receives`, `passes`: a voice may state each (protocol.json shapes.voice names them when the text lands)
function voicesFindings(state, type, add) {
  if ('clocks' in state && (type === 'actor' || type === 'grant') && Identity.clocksOf(state.clocks) === null) add(2, 'shape', 'state.clocks is { names, needed }: sorted block ids, needed by Counts');
  if ('clocks' in state && type === 'grant' && state.kind === 'key' && !('voices' in state)) add(2, 'shape', 'a key grant states clocks only with voices');
  if (!('voices' in state) || (type !== 'grant' && !(type === 'actor' && state.public_key_sign !== undefined))) return;
  const vs = state.voices;
  if (!Array.isArray(vs)) { add(2, 'shape', 'state.voices is a list of voices'); return; }
  if ('public_key_sign' in state && type === 'grant') add(2, 'shape', 'a key grant states voices or one public_key_sign, not both'); // a genesis names its own key beside its list
  const seen = new Set();
  let needsClock = false;
  vs.forEach((v, i) => {
    if (!Basics.isObj(v)) { add(2, 'shape', 'a voice is an object'); return; }
    const kinds = ['key', 'key_hash', 'names'].filter(k => k in v);
    const set = kinds.length === 1 ? [...Basics.P.shapes.voice[kinds[0]].filter(f => !(kinds[0] === 'key_hash' && f === 'suite')), ...VOICE_FIELDS_1_9] : null; // a hidden voice states no `suite`
    if (!set || Object.keys(v).some(k => !set.includes(k))) { add(2, 'shape', 'a voice is exactly one of key, key_hash, names with its own fields'); return; }
    if (i === 0 && kinds[0] === 'names') add(2, 'shape', 'the first voice is a key or a key_hash, never other people');
    for (const f of ['each', 'limit']) if (f in v) { const c = amountProblem(v[f]); if (c) add(2, c, 'voice ' + f); else if (Deals.decCmp(v[f].value, '0') < 0) add(2, 'shape', 'voice ' + f + ' is zero or more'); }
    if ('every' in v) { const c = durationProblem(v.every); if (c) add(2, c, 'voice every'); else if (!('limit' in v)) add(2, 'shape', 'a voice states every only with limit'); }
    if ('suite' in v && !Basics.SUITES.includes(v.suite)) { add(2, 'unknown_suite', 'voice suite'); return; }
    const vs_ = v.suite || 'std';
    if (kinds[0] === 'key') {
      if (!(Basics.isStr(v.key) && Bytes.keyGrammar(vs_).test(v.key) && Bytes.keySound(v.key))) add(2, 'unknown_suite', 'voice key');
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
    if ('above' in v && (v.above !== true || kinds[0] !== 'names')) add(2, 'shape', 'above is true on a voice of other people, or left out');
    for (const f of ['wait', 'reach']) if (f in v) { const q = durationProblem(v[f]); if (q) add(2, q, 'voice ' + f); else if (f === 'reach' || !isZeroDur(v[f])) needsClock = true; }
  });
  if (needsClock && !('clocks' in state)) add(2, 'shape', 'a list that states a wait above zero, or any reach, states clocks');
  if (vs.filter(v => Basics.isObj(v) && v.receives === true).length > 1) add(2, 'shape', 'receives is true on one voice at most');
}
// a value the text leaves no code for (a suite name, a key or an id outside its grammar, in a block's body) keeps the code `unknown_suite` in `read`, as `grammar` elsewhere.
// a header id (author, prev, key) outside its grammar is `chain` (an unknown hash name there is `unknown_suite`, a wait); the wrong keys of a header given are `chain` too.
// every finding of the bytes and the values, each in its bucket. `valid` reads the buckets size, bytes and header (in that order, stopping at the first that has
// anything: validCheck); `read` adds the bucket value to check 7. A finding is { stage, code, detail, bucket }.
function contentFindings(b, ctx) {
  const out = [];
  const BUCKET_OF = (stage, code) => (stage === 1 ? 'bytes' : (stage === 2 && (code === 'float' || code === 'integer_range')) ? 'bytes' : code === 'size_limit' ? 'size' : code === 'chain' ? 'header' : 'value');
  // a float or an out-of-range whole number is `not_canonical` in bytes that came as text; in a value handed to a writer (ctx.writer) it keeps its own code
  // (protocol.json refusals.codes.block: float and integer_range are "in a value that never was text")
  const add = (stage, code, detail, bucket) => { const bk = bucket || BUCKET_OF(stage, code); out.push({ stage, code: bk === 'bytes' && stage === 2 && !(ctx && ctx.writer) ? 'not_canonical' : code, detail: detail || '', bucket: bk }); };
  const whole = Basics.isObj(b) && ['type', 'state', 'refs'].every(k => k in b);
  // ---- exactly {type,state,refs}, strict writing
  if (!Basics.isObj(b) || !whole || Object.keys(b).some(k => !['type', 'state', 'refs'].includes(k))) { add(1, 'not_canonical', 'not exactly type, state and refs'); return out; }
  const { type, state, refs } = b;
  if (!Basics.isObj(state)) add(1, 'not_canonical', 'state is not an object');
  if (!Basics.isObj(refs)) add(1, 'not_canonical', 'refs is not an object');
  if (out.length) return out;
  // ---- the size, first: bytes over limits.block_bytes, or opening more than limits.depth levels, are `size_limit` and nothing else is read
  { let cb = null; try { cb = Buffer.byteLength(Bytes.canonical(type, state, refs), 'utf8'); } catch (e) { cb = null; }
    if ((cb !== null && cb > Basics.P.limits.block_bytes)) add(3, 'size_limit', 'over ' + Basics.P.limits.block_bytes);
    if (1 + Math.max(depthOf(state), depthOf(refs)) > Basics.P.limits.depth) add(3, 'size_limit', 'nests deeper than ' + Basics.P.limits.depth);
    if (out.length) return out; }
  const walk = (v, path) => {
    if (v === null) return add(1, 'not_canonical', 'null at ' + path.join('.'));
    if (Basics.isStr(v)) { if (lonePair(v)) add(1, 'not_canonical', 'text that is not well-formed at ' + path.join('.')); return; } // no normal form is checked (core.md, section 3)
    if (typeof v === 'number') {
      // from 1e21 on, JSON (RFC 8785) writes a number with an exponent, so it is a float whatever its value
      if (!Number.isInteger(v) || Math.abs(v) >= 1e21) add(2, 'float', path.join('.'));
      else if (Object.is(v, -0) || Math.abs(v) > MAXI) add(2, 'integer_range', path.join('.'));
      return;
    }
    if (typeof v === 'boolean') return;
    if (Array.isArray(v)) {
      if (path.length === 2 && path[0] === 'refs' && v.every(Basics.isStr)) for (let i = 1; i < v.length; i++) if (!(Basics.byBytes(v[i - 1], v[i]) < 0)) { add(1, 'not_canonical', 'a set under ' + path.join('.') + ' is not sorted by the bytes of its strings, or repeats'); break; }
      v.forEach((x, i) => walk(x, [...path, i])); return;
    }
    if (Basics.isObj(v)) for (const [k, x] of Object.entries(v)) { if (lonePair(k)) add(1, 'not_canonical', 'a key that is not well-formed text'); walk(x, [...path, k]); }
  };
  walk(state, ['state']); walk(refs, ['refs']);
  // ---- values
  if (!Basics.isStr(type) || !RX.type_name.test(type)) add(2, 'type_name', String(type)); // core.md section 1: a type is a word matching grammar.type_name
  for (const k of Basics.P.refs_single) if (Basics.isObj(refs) && Array.isArray(refs[k])) add(2, 'grammar', 'refs.' + k + ' is one id'); // core.md section 1
  // a link is one id or a sorted set of ids, never an empty set (core.md section 5)
  // the header's links are one id each: an author, prev or key that is a list (or anything but one id) is `chain`
  for (const k of ['author', 'prev', 'key']) if (refs[k] !== undefined && !Basics.isStr(refs[k])) add(2, 'chain', 'refs.' + k + ' is one id', 'header');
  for (const [k, v] of Object.entries(refs)) { if (['author', 'prev', 'key'].includes(k) && !Basics.isStr(v)) continue; if (Array.isArray(v) && !v.length) add(2, 'grammar', 'refs.' + k + ' is an id or a set of ids'); for (const id of asList(v)) { const p = idProblem(id); if (p) add(2, ['author', 'prev', 'key'].includes(k) ? (p === 'unknown_suite' ? 'unknown_suite' : 'chain') : p, 'refs.' + k, ['author', 'prev', 'key'].includes(k) ? 'header' : 'value'); } }
  const timeAt = (o, where) => {
    if (!Basics.isObj(o)) return;
    for (const f of Basics.TIME_FIELDS) if (f in o) {
      const v = o[f];
      if ((f === 'pay_by' || f === 'deliver_by') && where !== 'state') { // a time, a duration (added to the start of the occurrence where the promise repeats), or a range or a list of them
        if (Grants.isRL(v)) { const q = Grants.rangeListProblem(v); if (q) add(2, q, where + '.' + f); continue; }
        if (Basics.isStr(v) && parseDur(v)) continue;
      }
      if (f === 'when' && where === 'state' && o.kind === 'cutoff' && parseDur(v)) continue; // a cutoff of a span states the span itself as its `when`
      if (f === 'when' && !Basics.isStr(v)) {
        // blocks.md: an instant, a range { from, to } (from no later than to), a relative form { after, wait }, or a window (not_before, not_after,
        // takes: at least one, alone or beside a range or a relative form); an object that fits none, or any other value, is shape
        const keys = Basics.isObj(v) ? Object.keys(v) : [];
        const allowed = [...Basics.P.shapes.when, ...Basics.P.shapes.when_after, ...Basics.P.shapes.when_window];
        const range = Basics.isObj(v) && has(v, 'from', 'to'), relative = Basics.isObj(v) && has(v, 'after', 'wait'), windowed = Basics.P.shapes.when_window.some(k => keys.includes(k));
        if (!Basics.isObj(v) || keys.some(k => !allowed.includes(k)) || !(range || relative || windowed)) { add(2, 'shape', where + '.when fits none of its forms'); continue; }
        if (relative) { if (!(Basics.isStr(v.after) && v.after !== '')) add(2, 'shape', 'when.after is a block id or an observe kind'); const q = durationProblem(v.wait); if (q) add(2, q, 'when.wait'); }
        for (const e of ['from', 'to', 'not_before', 'not_after']) if (e in v) { const q = timeProblem(v[e]); if (q) add(2, q, 'when.' + e); }
        if (range && !timeProblem(v.from) && !timeProblem(v.to) && v.from > v.to) add(2, 'shape', 'when.from is after its to');
        // a window opens before it closes
        if (Basics.isStr(v.not_before) && Basics.isStr(v.not_after) && !timeProblem(v.not_before) && !timeProblem(v.not_after) && v.not_before > v.not_after) add(2, 'shape', 'when.not_before is after its not_after');
        if ('takes' in v) { const q = durationProblem(v.takes); if (q) add(2, q, 'when.takes'); }
      } else { const q = timeProblem(v); if (q) add(2, q, where + '.' + f); }
    }
    for (const f of Basics.DATE_FIELDS) if (f in o) { const q = dateProblem(o[f]); if (q) add(2, q, where + '.' + f); }
    // per is a duration everywhere but a price's unit (an amount), which sits inside a price, never in a scope
    for (const f of Basics.DURATION_FIELDS) if (f in o) { const q = durationProblem(o[f]); if (q) add(2, q, where + '.' + f); }
  };
  timeAt(state, 'state'); timeAt(state.terms, 'terms'); timeAt(state.scope, 'scope');
  // a place (things.md), on any type: a point { lat, lon } in WGS84 degrees, or an area, a point with a radius in m
  if ('where' in state && !whereOk(state.where)) add(2, 'shape', 'state.where is a point or an area');
  if (Basics.isObj(state.when)) timeAt({ when: state.when }, 'state');
  if (Basics.isObj(state.terms)) for (const l of asList(state.terms.lines)) timeAt(l, 'line');
  for (const flag of ['skip']) if (flag in state && state[flag] !== true) add(2, 'shape', 'state.' + flag + ' is true, or left out'); // `withheld` is no field (an unknown field is read's `undeclared_field`)
  // her stop of one thing is an observe with status stopped, stop onward and refs.what, naming no refs.updates and no refs.answers; without those it is a status on a block that answers nothing
  if (type === 'observe' && state.status === 'stopped' && refs.updates === undefined && refs.answers === undefined && (state.stop !== 'onward' || asList(refs.what).length !== 1)) add(8, 'status_not_answer', 'a status on a block that neither answers nor updates its author\'s own, bar her stop of one thing');
  for (const k of ['line', 'channel', 'handle']) if (k in state && !Basics.isStr(state[k])) add(2, 'shape', 'state.' + k + ' is text');
  // an opening (privacy.md, A commitment) is { salt, value }, the salt in its grammar; a conditioned transfer carries its condition whole (things.md)
  if ('opening' in state && !(Basics.isObj(state.opening) && Object.keys(state.opening).every(k => Basics.P.shapes.reveal.includes(k)) && Basics.isStr(state.opening.salt) && RX.salt.test(state.opening.salt) && state.opening.value !== undefined)) add(2, 'shape', 'state.opening is { salt, value }');
  if ('condition' in state && Bytes.conditionProblem(state.condition)) add(2, 'shape', 'state.condition');
  // protocol.json kind_fields names the kind `received` only in its about text and gives it no `field:shape` line, so check 7 judges its `state.amount` by the field's own shape and reads `state.line` as it reads any open word
  // the typed fields of a kind (protocol.json kind_fields): `field:shape` lines under a type and a kind; a field that is there must have its shape
  if (Basics.isStr(state.kind) && Basics.isObj(tableEntry(Basics.P.kind_fields, type)) && Array.isArray(tableEntry(Basics.P.kind_fields[type], state.kind))) {
    const pick = (path) => path.split('.').reduce((o, k) => (Basics.isObj(o) && k in o ? o[k] : undefined), state);
    const closed = (path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), Basics.P);
    for (const line of Basics.P.kind_fields[type][state.kind]) {
      const at = line.indexOf(':'), field = line.slice(0, at), asked = line.endsWith('!'), shape = line.slice(at + 1, asked ? -1 : undefined), v = pick(field), where = 'state.' + field;
      if (v === undefined) { if (asked) add(2, 'required', where + ' is stated'); continue; }
      if (shape === 'count') { if (!(Number.isInteger(v) && v >= 1)) add(2, 'shape', where + ' is a whole number of at least 1'); }
      else if (shape === 'text') { if (!Basics.isStr(v)) add(2, 'shape', where + ' is text'); }
      else if (shape === 'hash') { if (!(Basics.isStr(v) && RX.hash.test(v))) add(2, 'grammar', where + ' is a SHA-256 digest in hex'); }
      else if (shape === 'id') { if (!(Basics.isStr(v) && RX.id.test(v))) add(2, 'grammar', where + ' is an id'); }
      else if (shape === 'time') { const q = timeProblem(v); if (q) add(2, q, where); }
      else if (shape === 'time_or_duration') { if (!(Basics.isStr(v) && parseDur(v))) { const q = timeProblem(v); if (q) add(2, q, where); } } // a cutoff's `when` is an instant, or for a span the span itself
      else if (shape.startsWith('in:')) { if (!(Basics.isStr(v) && closed(shape.slice(3)).includes(v))) add(2, 'shape', where + ' is one of the list'); }
    }
  }
  // marks, on any type, open or closed (things.md): a list of exactly { scheme, value }, both text
  if ('marks' in state && !(Array.isArray(state.marks) && state.marks.every(m => Basics.isObj(m) && Object.keys(m).every(k => Basics.P.shapes.mark.includes(k)) && Basics.isStr(m.scheme) && Basics.isStr(m.value)))) add(2, 'shape', 'state.marks lists exact marks [{ scheme, value }]');
  if ('nonce' in state && (!Basics.isStr(state.nonce) || !RX.nonce.test(state.nonce))) add(2, 'grammar', 'nonce');
  // state.draws is { grant, amount }, an id and an amount
  if ('draws' in state && !(Basics.isObj(state.draws) && Object.keys(state.draws).every(k => k === 'grant' || k === 'amount') && Basics.isStr(state.draws.grant) && RX.id.test(state.draws.grant) && shapeOf(state.draws.amount) === 'amount' && !amountProblem(state.draws.amount))) add(2, 'shape', 'state.draws is { grant, amount }');
  for (const f of ['counted_to']) if (f in state) { const p = idProblem(state[f]); if (p) add(2, p, f); }
  for (const f of ['parties']) if (f in state) for (const id of asList(state[f])) { const p = idProblem(id); if (p) add(2, p, f); }
  // a commitment is written like an id: one in state.audience with a hash name the reader does not know is unknown_suite (core.md, section 2)
  if (Array.isArray(state.audience) && state.audience.some(x => Basics.isStr(x) && RX.id.test(x) && idProblem(x) === 'unknown_suite')) add(2, 'unknown_suite', 'state.audience');
  // suites and keys
  for (const f of ['suite']) if (f in state && !Basics.SUITES.includes(state[f])) add(2, 'unknown_suite', f);
  const ks = Basics.SUITES.includes(state.suite) ? state.suite : 'std';
  if ('public_key_sign' in state && !(Basics.isStr(state.public_key_sign) && Bytes.keyGrammar(ks).test(state.public_key_sign) && Bytes.keySound(state.public_key_sign))) add(2, 'unknown_suite', 'public_key_sign');
  if ('shown_key' in state && !(Basics.isStr(state.shown_key) && Bytes.suiteOfKey(state.shown_key) !== null && Bytes.keySound(state.shown_key))) add(2, 'unknown_suite', 'shown_key');
  // her voices and her clock (identity.md, Her voices; blocks.md, A named clock): checked here, in the bytes, with the codes shape, grammar, time and unknown_suite
  voicesFindings(state, type, add);
  // a genesis that states her list: its own key is the `key` voice of that list that names it; else it is no genesis (`shape`)
  if (type === 'actor' && refs.author === undefined && Array.isArray(state.voices) && !state.voices.some(v => Basics.isObj(v) && Basics.isStr(v.key) && v.key === state.public_key_sign)) add(2, 'shape', 'a genesis whose key is no voice of its own list');
  if ('public_key_encrypt' in state) { const bad = Bytes.encKeyProblem(state.public_key_encrypt, ks); if (bad) add(2, bad, 'public_key_encrypt'); }
  { const found = []; shapeFindings(state, found, 'state'); if (type === 'promise' || type === 'transfer' || type === 'transform') amountsBelowZero(state, found, 'state'); found.forEach(x => add(2, x.code, x.detail)); }
  // an amount beside refs.what, and a thing's pack, carry no `of`: their kind is the measure's own (encoding.md, Shapes)
  if (Basics.isObj(state.pack) && 'of' in state.pack) add(2, 'shape', 'a pack carries no of');
  // what a make takes: [{ from, amount }], each `from` one of its refs.derives_from (things.md, A make)
  // `state.inputs` of that shape is a make's (a transform's); a read-back's `state.inputs` (readings/readback.md) is a sorted list of ids, a field of its own kind
  if ('inputs' in state && !(type === 'observe' && state.kind === 'readback')) {
    if (!Array.isArray(state.inputs) || !state.inputs.length) add(2, 'shape', 'state.inputs lists { from, amount }');
    else for (const x of state.inputs) if (!Basics.isObj(x) || Object.keys(x).length !== 2 || shapeOf(x) !== 'input' || !asList(refs.derives_from).includes(x.from)) add(2, 'shape', 'state.inputs[].from is one of refs.derives_from');
  }
  // the codes of one check come in the order protocol.json lists them (core.md section 8)
  { const ord = Object.keys(Basics.P.refusals.codes.block); out.sort((x, y) => x.stage - y.stage || ord.indexOf(x.code) - ord.indexOf(y.code)); }
  if (out.some(o => o.bucket === 'bytes')) return out;
  if (asList(refs.after).length > Basics.P.limits.after_heads) add(3, 'after_limit', 'after names more than ' + Basics.P.limits.after_heads);
  // ---- the header: a genesis, or the common five (`chain`); a genesis's own value checks and every audience are read's
  const isActor = type === 'actor';
  // an actor with no author, or one that names a signing key, is read against the genesis (core.md section 4: a key comes in by a key grant); any other actor is an ordinary block.
  // it is a genesis only where it names its key and has no author and no seq; else it has the common five or is `chain`, and what it has of a genesis's is read's `bad_genesis`
  if (isActor && (refs.author === undefined || 'public_key_sign' in state)) {
    const genesis = Basics.isStr(state.public_key_sign) && refs.author === undefined && state.seq === undefined; // one rule with isGenesisBlock: a key that is not text names no key
    if (!genesis && (refs.author === undefined || refs.prev === undefined || !Number.isInteger(state.seq) || state.seq < 1 || state.audience === undefined)) add(4, 'chain', 'a block has the common five (author, seq, prev, audience), or is a genesis');
    const bad = [];
    if (refs.author !== undefined || refs.prev !== undefined || refs.after !== undefined || state.seq !== undefined) bad.push('has author, prev, after or seq');
    for (const f of Basics.P.genesis.required) if (!(f in state) || (f !== 'audience' && (!Basics.isStr(state[f]) || state[f] === ''))) bad.push('missing ' + f);
    // protocol.json genesis.optional_about: reach and clocks, clocks required with reach
    if ('reach' in state && !('clocks' in state)) bad.push('reach with no clocks');
    if ('reach' in state) { const q = durationProblem(state.reach); if (q) add(2, q, 'state.reach'); } // her first voice's reach is a duration (identity.md, Her voices)
    const allowed = new Set([...Basics.P.genesis.required, ...Basics.P.key_fields.fields.filter(f => !['roles', 'voices', 'shown_key'].includes(f)), 'voices', ...Basics.P.genesis.private]); // a genesis may state her list in `state.voices`
    for (const k of Object.keys(state)) if (!allowed.has(k)) bad.push('field ' + k);
    for (const k of Object.keys(refs)) bad.push('ref ' + k);
    if (bad.length) add(4, 'bad_genesis', bad.join('; '));
    // a genesis's audience is any block's: public, or a sorted list of commitments with a nonce
    if (state.audience !== undefined) audienceCheck(state, add);
  } else {
    for (const f of ['author', 'prev']) if (refs[f] === undefined) add(4, 'chain', 'no refs.' + f);
    if (!Number.isInteger(state.seq) || state.seq < 1) add(4, 'chain', 'no state.seq');
    if (state.audience === undefined) add(4, 'chain', 'no state.audience');
    else audienceCheck(state, add);
    // a block may leave its `at` out (`at_missing` leaves `valid` and `read`); a missing `at` reads as a time not in time, in every part
  }
  // the pieces and the signature are `valid`'s, and the value codes of every bucket 'value' are read's (readFindings)
  return out;
}
// what `valid` reads of a block's own bytes: the size, then the bytes, then the header. The first that finds anything, with every code that check found.
const validCheck = (b, ctx) => { const all = contentFindings(b, ctx); for (const k of ['size', 'bytes', 'header']) { const f = all.filter(x => x.bucket === k); if (f.length) return f; } return []; };
// what `read` finds in a valid block's values (the codes that left `valid`), in any type
const valueCheck = (b, ctx) => contentFindings(b, ctx).filter(x => x.bucket === 'value');

// an audience (privacy.md): public, or a sorted list of commitments, a private block carrying a nonce
function audienceCheck(state, add) {
  const a = state.audience;
  if (a === 'public') return;
  // a commitment is written like an id: one with a hash name the reader does not know is unknown_suite (core.md, section 2)
  if (!Array.isArray(a) || !a.length || !a.every(Basics.isStr) || a.some(x => idProblem(x) === 'grammar') || a.some((x, i) => i && !(a[i - 1] < x))) add(4, 'audience', 'neither public nor a sorted list of commitments');
  else if (!('nonce' in state)) add(4, 'audience', 'a private block carries a nonce'); // the text gives the nonce to private blocks but names no code for its absence (the text does not say; read so)
}
function closedFindings(b, ctx, add) {
  const { type, state, refs } = b, given = ctx.blocks;
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
  if (type === 'actor') { if (!asAnswer) req(Basics.isStr(state.kind) && state.kind !== '', 'actor kind'); }
  if (type === 'grant') {
    if (!asAnswer) {
      req(Basics.isStr(state.kind) && state.kind !== '', 'grant kind');
      if (state.kind === 'key') {
        req(refs.subject !== undefined, 'key grant subject');
        // identity.md: a key grant states her list (voices, and the list it replaces in refs.updates), adds one key under a voice, shows a key, or adds an encryption key
        req(['voices', 'public_key_sign', 'public_key_encrypt', 'shown_key'].some(k => k in state), 'a key grant names a key or a list');
        if ('voices' in state) req(refs.updates !== undefined, 'a key grant that states voices names the list it replaces in refs.updates');
      }
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
    if (Basics.isObj(state.amount) && 'of' in state.amount && refs.what !== undefined) add(A, 'shape', 'an amount beside refs.what carries no of');
  }
  // a promise states what it moves or prices in its lines, or says in state.what what it is (core.md section 7)
  if (type === 'promise' && !asAnswer && !counter) req(state.what !== undefined || (Basics.isObj(state.terms) && state.terms.lines !== undefined), 'promise lines or what');
  // what a promise moves is in its lines and nowhere else (promises.md, What moves)
  if (type === 'promise' && refs.what !== undefined) add(A, 'lines', 'a promise names what moves in its lines, never in refs.what');
  // undeclared
  // A schema the block names declares more fields (its `fields`) and more ref keys (its `roles`), when the checker keeps a schema store
  // (the door's `schemas` list). With no store the fields a schema may declare are not judged; with one, a named schema it does not hold is
  // `undeclared_ref` (ask for it) (core.md, section 8).
  const store = ctx.schemas, schema = refs.schema && store ? store.get(refs.schema) : undefined;
  if (!refs.schema || schema) {
    // only a schema declares: a thing of kind schema; any other block named in refs.schema widens nothing
    const asSchema = schema && schema.type === 'thing' && Basics.isObj(schema.state) && schema.state.kind === 'schema' ? schema : undefined;
    const declared = asSchema ? schemaFieldSpecs(asSchema).map(x => x[0]) : [];
    const roles = asSchema && Array.isArray(asSchema.state.roles) ? asSchema.state.roles : [];
    const allowed = new Set([...FIELDS_EVERY, ...baseFields(type), ...declared]); // a profile adds no field: its schema declares them, named by the block
    // a machine lock is a plain stop of the machine: `how`, `placer`, `safe`, `reach` and `checked` are no fields, and `lifted` is no status
    for (const k of Object.keys(state)) if (!allowed.has(k)) add(A, 'undeclared_field', k);
    // a key, its suite and her voices are named by a genesis or a key grant alone (core.md, sections 2 and 4): never another actor, never another
    // grant, never a stop or an answer
    const keyHolder = type === 'grant' && state.kind === 'key' && state.status === undefined;
    if (keyHolder && 'reach' in state) add(A, 'undeclared_field', 'reach'); // a voice's reach is stated in her list, never on the key grant (identity.md, Her voices)
    if (!keyHolder) for (const k of ['public_key_sign', 'suite', 'reach', 'voices', 'shown_key', ...(type === 'actor' || type === 'grant' ? ['clocks'] : []), ...(type === 'grant' ? ['public_key_encrypt'] : [])]) if (k in state && !(k === 'clocks' && type === 'actor' && state.kind === 'circle')) add(A, 'undeclared_field', k); // a circle's own `clocks`
    for (const k of Object.keys(refs)) if (!SHARED_REFS.has(k) && !roles.includes(k)) add(A, 'undeclared_ref', k);
    // a promise's terms are the protocol's (protocol.json terms) and those its schema declares (state.terms, promises.md, Terms): no fold reads a
    // term it does not know, so a schema's own term binds no one
    if (type === 'promise' && Basics.isObj(state.terms)) {
      const declaredTerms = asSchema && Basics.isObj(asSchema.state.terms) ? Object.keys(asSchema.state.terms) : [];
      for (const k of Object.keys(state.terms)) if (!Basics.P.terms.includes(k) && !TERMS_1_9.includes(k) && !declaredTerms.includes(k)) add(A, 'undeclared_field', 'terms.' + k);
      // `waits_on` is `goods` or `price`; `in_hand` is true, or left out; `step` is an amount (an amount in the price's unit)
      if ('waits_on' in state.terms && !['goods', 'price'].includes(state.terms.waits_on)) add(A, 'shape', 'terms.waits_on is goods or price');
      if ('in_hand' in state.terms && state.terms.in_hand !== true) add(A, 'shape', 'terms.in_hand is true, or left out');
      if ('step' in state.terms && (amountProblem(state.terms.step) !== null || !Deals.fpos(Deals.dec(state.terms.step.value || '0') || Deals.F0))) add(A, 'shape', 'terms.step is an amount above zero');
    }
  } // a schema named and not given is read's `names_missing` (it is in `needs`), never a field judged against nothing
  // module checks
  // a circle (circles.md): `pack` whole parts, `rules` rows of one of two shapes, `clocks`; a row's numbers whole and at least 1
  // `pack` and `rules` belong to a circle's actor alone (circles.md)
  if (type === 'actor' && state.kind !== 'circle') for (const k of ['pack', 'rules']) if (k in state) add(A, 'undeclared_field', 'only a circle states state.' + k);
  if (type === 'actor' && state.kind === 'circle') {
    const hasPack = 'pack' in state;
    if (hasPack && !(Basics.isObj(state.pack) && Deals.isAmount(state.pack) && state.pack.unit === 'part' && !('of' in state.pack) && /^[1-9][0-9]*$/.test(state.pack.value))) add(A, 'shape', 'a circle\'s pack is whole parts: an amount of unit part, a whole number of at least 1, with no of');
    if ('rules' in state && !(Array.isArray(state.rules) && state.rules.every(r => Circles.rowShapeOk(r, hasPack)))) add(A, 'shape', 'a circle row is { parts, scope } or { to, needed, scope }, every number whole and at least 1, a parts row only on a circle with a pack');
    if ('clocks' in state && Identity.clocksOf(state.clocks) === null) add(A, 'shape', 'state.clocks is { names, needed }');
  }
  // a rekey (profiles/rekeys.md): state.epoch a whole number, signed as the circle, with the sealed keys and epoch n-1 in refs.after
  if (type === 'grant' && state.kind === 'key' && 'epoch' in state && !asAnswer) { // an answer is never a grant: no key-grant rule reads it
    if (!(Number.isInteger(state.epoch) && state.epoch >= 1)) add(A, 'shape', 'state.epoch is a whole number of at least 1');
    if (refs.as === undefined) add(A, 'required', 'a rekey is signed as the circle');
    if (state.keys === undefined || refs.after === undefined) add(A, 'required', 'a rekey holds state.keys and names epoch n-1 in refs.after');
  }
  // the founding block's change lines (circles.md, Versions): [{ rule, needed }], each rule once, needed by Counts (folds.md)
  // her stop of one thing is an observe with status stopped, stop onward and refs.what, naming no refs.updates and no refs.answers; a lift updates it with status resumed
  if (['promise', 'grant', 'transfer'].includes(type)) { // a status goes with an answer or the author's own stop; a stop goes with status stopped
    const stopOk = x => x === 'before' || x === 'onward' || (Basics.isObj(x) && Object.keys(x).every(k => k === 'occurrences') && Array.isArray(x.occurrences) && x.occurrences.every(o => Basics.isStr(o) && (timeProblem(o) === null || RX.hash.test(o))));
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
        const target = given.get(refs.answers);
        if (target) { const first = target.refs.answers === undefined ? target.hash : target.refs.for; if (first !== undefined && refs.for !== first) add(A, 'deal_not_named', 'refs.for is not the first promise'); }
      }
    }
    // Whether the signer is a side is the fold's to read (folds.md, Who a block speaks for: a block that speaks for neither side counts for nothing):
    // a side may name a thing, whose owner is not a block this one rests on (promises.md, Bearer; core.md, invariant 25), so the check never refuses it.
    // an ask may carry terms.expires or not: with none it lasts until its author stops it
    if ('what' in state && !(Basics.isStr(state.what) || Basics.isObj(state.what))) add(A, 'shape', 'state.what describes time or a job (text, or data under a schema)');
    if ('terms' in state && !Basics.isObj(state.terms)) add(A, 'shape', 'state.terms is { price, quantity, lines, ... }');
    const terms = Basics.termsOf(b);
    // which terms it may carry is judged with its schema (above); a line is { id, what, quantity, price }
    if ('zone' in terms && !zoneOk(terms.zone)) add(A, 'grammar', 'terms.zone is an IANA time zone name');
    // a wrapped condition names its deadline and clocks (promises.md, By a time); terms.clocks is a named clock (blocks.md)
    if ('condition' in terms && Bytes.conditionProblem(terms.condition)) add(A, 'shape', 'terms.condition');
    if ('clocks' in terms && Identity.clocksOf(terms.clocks) === null) add(A, 'shape', 'terms.clocks is { names, needed }');
    // catch weight (promises.md, Terms): terms.band is a decimal from 0 to 1, a fraction of the quantity chosen
    if ('band' in terms && !(Basics.isStr(terms.band) && Deals.dec(terms.band) && RX.decimal.test(terms.band) && Deals.decCmp(terms.band, '0') >= 0 && Deals.decCmp(terms.band, '1') <= 0)) add(A, 'shape', 'terms.band is a decimal from 0 to 1');
    // what the payer gives up if the deal ends before it is done (money), and what is to come that cannot be handed on (true): promises.md, Terms
    if ('forfeit' in terms) { const c = amountProblem(terms.forfeit); if (c) add(A, c, 'terms.forfeit'); else if (Deals.decCmp(terms.forfeit.value, '0') < 0) add(A, 'shape', 'terms.forfeit is zero or more'); }
    if ('backing' in terms) { const c = amountProblem(terms.backing); if (c) add(A, c, 'terms.backing'); else if (Deals.decCmp(terms.backing.value, '0') < 0) add(A, 'shape', 'terms.backing is zero or more'); }
    // a judge's offer that tries to settle first (true), and the part of her fee she gives back if the sides settle (a decimal 0 to 1; needs the conciliation): promises.md, Rulings
    if ('conciliation' in terms && terms.conciliation !== true) add(A, 'shape', 'terms.conciliation is true');
    if ('fee_back' in terms) {
      if (!(Basics.isStr(terms.fee_back) && RX.decimal.test(terms.fee_back) && Deals.decCmp(terms.fee_back, '0') >= 0 && Deals.decCmp(terms.fee_back, '1') <= 0)) add(A, 'shape', 'terms.fee_back is a decimal from 0 to 1');
      else if (terms.conciliation !== true) add(A, 'shape', 'terms.fee_back needs terms.conciliation');
    }
    // `terms.show` is no term (silence is no promise; a refrain is her signed word): an unknown term is read's `undeclared_field`
    if (state.status !== undefined) for (const k of Object.keys(terms)) if (k !== 'lines') add(A, 'undeclared_field', 'terms.' + k + ' on an answer');
    // a repeat is an RRULE (one FREQ part, any calendar named by RSCALE) counted from state.when, or an event { after, by, wait }
    if ('repeat' in terms) {
      const r = terms.repeat, named = x => Basics.isStr(x) && x !== '';
      if (Basics.isStr(r)) { if (!rruleOk(r)) add(A, 'grammar', 'terms.repeat is an RRULE'); if (state.when === undefined) add(A, 'shape', 'a repeat counts from state.when'); if (terms.zone === undefined) add(A, 'shape', 'a calendar repeat is read in terms.zone'); }
      else if (Basics.isObj(r)) {
        if (Object.keys(r).some(k => !Basics.P.repeat.keys.includes(k)) || !named(r.after) || (r.by !== undefined && !(Array.isArray(r.by) && r.by.length && r.by.every(x => Basics.isStr(x) && RX.id.test(x))))) add(A, 'shape', 'a repeat on an event is { after, by, wait }');
        // by and wait may be left out (the text names { after, by, wait } and reads by as optional; it does not say wait is required) (the text does not say; read so)
        if ('wait' in r) { const q = durationProblem(r.wait); if (q) add(A, q, 'terms.repeat.wait'); }
      } else add(A, 'grammar', 'terms.repeat is an RRULE');
    }
    if (state.status !== undefined) {
      // an answer that carries a status names no term but the quantities it chooses (promises.md, Answers): terms.lines of { id, quantity }
      if ('lines' in terms && !(Array.isArray(terms.lines) && terms.lines.length)) add(A, 'lines', 'terms.lines on an answer lists { id, quantity }');
      for (const l of Array.isArray(terms.lines) ? terms.lines : []) {
        if (!Basics.isObj(l)) { add(A, 'lines', 'a line on an answer is { id, quantity }'); continue; }
        for (const k of Object.keys(l)) if (k !== 'id' && k !== 'quantity') add(A, 'undeclared_field', 'terms.lines.' + k + ' on an answer');
        if (!Basics.isStr(l.id) || l.id === '') add(A, 'lines', 'a line on an answer names its id');
        if ('quantity' in l) { const c = amountProblem(l.quantity); if (c) add(A, c, 'a line\'s quantity chosen'); }
      }
    } else {
      if ('lines' in terms && !(Array.isArray(terms.lines) && terms.lines.length)) add(A, 'lines', 'terms.lines lists { id, what, quantity, price }');
      if (Array.isArray(terms.lines)) {
        for (const l of terms.lines) {
          if (!Basics.isObj(l) || Object.keys(l).some(k => !Basics.P.line.includes(k))) add(A, 'lines', 'a line is { id, what, quantity, price }');
          if (!Basics.isObj(l)) continue;
          // what, quantity and price are each optional, and a line states at least one (promises.md, A deal is its lines)
          if (!['what', 'quantity', 'price'].some(k => k in l)) add(A, 'lines', 'a line states what, quantity or price');
          if ('what' in l && (!Basics.isStr(l.what) || idProblem(l.what))) add(A, 'lines', 'a line\'s what is one id');
          // a line with no what moves its quantity (a loan); a promise whose state.what names a job prices time or work: a line is never both (promises.md, A deal is its lines)
          // in a promise whose state.what names a job, a line's quantity measures the work; a line with no what whose quantity is of its price's own kind moves that
          // amount back for more of it (a loan): a line is a loan or a job, never both (promises.md, A deal is its lines)
          { const kindOf = q => (Basics.isObj(q) ? (Deals.isAmount(q) ? q : Deals.isAmount(q.min) ? q.min : Deals.isAmount(q.max) ? q.max : null) : null);
            const qk = kindOf(l.quantity), pk = Basics.isObj(l.price) ? (Deals.isAmount(l.price) ? l.price : Deals.isAmount(l.price.amount) ? l.price.amount : null) : null;
            if (!('what' in l) && state.what !== undefined && qk && pk && Deals.sameKind(qk, pk)) add(A, 'lines', 'a line that moves an amount back for more of it (a loan), in a promise that names a job in state.what'); }
          for (const c of Grants.priceAndQuantity(l.price, l.quantity)) add(A, c, 'line price or quantity');
        }
        const ids = terms.lines.map(l => Basics.isObj(l) ? l.id : undefined);
        if (ids.some(i => !Basics.isStr(i) || i === '') || new Set(ids).size !== ids.length) add(A, 'lines', 'a line has an id unique in the promise');
        // every line's price is of one kind (encoding.md, Shapes: amounts of two kinds are never added)
        const kindsOfLines = new Set(terms.lines.filter(l => Basics.isObj(l) && Basics.isObj(l.price)).map(l => (perUnit(l.price) ? l.price.amount : l.price)).filter(x => Basics.isObj(x) && Basics.isStr(x.unit)).map(x => Bytes.jcs([x.unit, x.of === undefined ? null : x.of])));
        if (kindsOfLines.size > 1) add(A, 'lines', 'every line of one promise is priced in one kind');
      }
    }
  }
  if (type === 'grant' && 'fence' in state && !asAnswer) for (const [code, why] of fenceProblems(state.fence)) add(A, code, why);
  // a grant's depth is a whole number of 0 or more (authority.md)
  if (type === 'grant' && 'depth' in state && !(Number.isInteger(state.depth) && state.depth >= 0)) add(A, 'shape', 'state.depth is a whole number');
  // terms.needs is data under a schema, never a bare name (promises.md)
  if (type === 'promise' && Basics.isObj(state.terms) && 'needs' in state.terms && !(Basics.isObj(state.terms.needs) || Array.isArray(state.terms.needs))) add(A, 'shape', 'terms.needs is data from a schema');
  // many hands (circles.md): state.needed { power: N } for the powers circle.needed lists, N a whole number of at least 1
  // a grant's scope, whatever its kind (authority.md): an object, its types a list of types, its parties ids. A stop or an answer is never a grant,
  // whatever scope it restates: no scope rule reads it
  if (type === 'grant' && 'scope' in state && !asAnswer) {
    if (!Basics.isObj(state.scope)) add(A, 'shape', 'state.scope is an object');
    else {
      if (state.scope.types !== undefined && !(Array.isArray(state.scope.types) && state.scope.types.every(Basics.isStr))) add(A, 'shape', 'scope.types lists types');
      if (state.scope.parties !== undefined && !(Array.isArray(state.scope.parties) && state.scope.parties.every(x => Basics.isStr(x) && RX.id.test(x)))) add(A, 'grammar', 'scope.parties lists hashes');
      else if (Array.isArray(state.scope.parties) && state.scope.parties.some(x => idProblem(x) === 'unknown_suite')) add(A, 'unknown_suite', 'scope.parties names a hash this reader does not know');
    }
  }
  // a payment for several promises (things.md): state.split is a non-empty list of { for, line, amount, occurrence }, each `for` one of refs.for, its amount an amount
  // and its line, when given, a line id
  if (type === 'transfer' && 'split' in state) {
    const parts = state.split;
    if (!Array.isArray(parts) || !parts.length) add(A, 'shape', 'state.split lists { for, line, amount, occurrence }');
    else for (const x of parts) {
      if (!Basics.isObj(x) || Object.keys(x).some(k => !Basics.P.shapes.split.includes(k)) || !asList(refs.for).includes(x.for)) add(A, 'shape', 'state.split[].for is one of refs.for');
      if (!Basics.isObj(x) || shapeOf(x.amount) !== 'amount') add(A, 'shape', 'state.split[].amount is an amount');
      if (Basics.isObj(x) && x.line !== undefined && !Basics.isStr(x.line)) add(A, 'shape', 'state.split[].line is a line id');
      if (Basics.isObj(x) && x.occurrence !== undefined && !(Basics.isStr(x.occurrence) && (timeProblem(x.occurrence) === null || RX.hash.test(x.occurrence)))) add(A, 'shape', 'state.split[].occurrence is a start time or a hash');
    }
  }
  // a payment for several promises says how much goes to each (things.md, Transfers): its split, the payment's own kind and adding up to no more than it
  if (type === 'transfer' && !asAnswer && 'amount' in state && !('split' in state) && asList(refs.for).length > 1) add(A, 'required', 'a payment for several promises says how much goes to each (state.split)');
  const okAmount = m => shapeOf(m) === 'amount' && !amountProblem(m);
  if (type === 'transfer' && Array.isArray(state.split) && okAmount(state.amount) && state.split.every(x => Basics.isObj(x) && okAmount(x.amount))) {
    if (state.split.some(x => !Deals.sameKind(x.amount, state.amount))) add(A, 'shape', 'every part of state.split is of the payment\'s own kind');
    else if (Deals.fcmp(state.split.reduce((t, x) => Deals.fadd(t, Deals.dec(x.amount.value)), { n: 0n, d: 1n }), Deals.dec(state.amount.value)) > 0) add(A, 'shape', 'state.split adds up to no more than state.amount');
  }
  // what a payment covers is the word of the side it is paid to (promises.md, Settling): an amount, only on that side's accepted answer
  // the seller's transfer `for` the buyer's order, `to_owner` her, of the instance it names, is his yes and his delivery in one block; it states `state.covers` (`required`): what the seller says he has had of the price (the text does not say; read so)
  const spotOrderOf = (r) => {
    if (type !== 'transfer' || r.answers !== undefined || state.status !== undefined || !Basics.isStr(r.to_owner) || !Basics.isStr(r.for) || !Basics.isStr(r.author)) return null;
    const o = given.get(r.for);
    if (!(o && o.type === 'promise' && o.refs.answers === undefined && o.state.status === undefined && o.refs.to === r.to_owner && o.refs.author === r.to_owner && o.refs.from === r.author && whatsOf(o).some(h => asList(r.what).includes(h)))) return null;
    // the transfer is his yes and his delivery in one block only where he has not already said yes: an accept of the order by the seller before it makes it an ordinary delivery
    for (const x of given.values ? given.values() : []) if (x && x.type === 'promise' && x.state.status === 'accepted' && x.refs.answers === o.hash && x.refs.author === r.author) return null;
    return o;
  };
  const spot = spotOrderOf(refs);
  if (type === 'transfer' && 'covers' in state) {
    const c = amountProblem(state.covers);
    if (c) add(A, c, 'state.covers is an amount');
    if (!spot && (refs.answers === undefined || state.status !== 'accepted')) add(A, 'shape', 'state.covers goes only on an accepted answer to a payment, or on the seller\'s transfer for a buyer\'s order');
  } else if (spot) add(A, 'required', 'a seller\'s transfer for a buyer\'s order states state.covers (0 if nothing came): a missing covers is never read as credit');
  // a payment names the occurrence of a standing promise it pays (promises.md, Settling): its start time, or the hash of the block that
  // started it, as a stop names occurrences
  if (type === 'transfer' && 'occurrence' in state && !((Basics.isStr(state.occurrence) && (timeProblem(state.occurrence) === null || RX.hash.test(state.occurrence))) && state.amount !== undefined)) add(A, 'shape', 'state.occurrence goes on a payment: a start time, or the hash of the block that started it');
  // how many received (things.md): a whole number of at least 1
  if (type === 'transfer' && 'clocks' in state && (refs.to_owner !== undefined || Identity.clocksOf(state.clocks) === null)) add(A, 'shape', 'state.clocks goes on an open hand-over and is { names, needed }');
  if (type === 'transfer' && 'clocks' in state && (refs.to_owner !== undefined || Identity.clocksOf(state.clocks) === null)) add(A, 'shape', 'state.clocks goes on an open hand-over and is { names, needed }');
  if (type === 'transfer' && 'count' in state && !(Number.isInteger(state.count) && state.count >= 1)) add(A, 'shape', 'state.count is a whole number from 1');
  // the scope's own rules hold whatever the kind (a grant with no kind is refused for that too)
  if (type === 'grant' && !asAnswer) {
    const scope = Basics.isObj(state.scope) ? state.scope : null;
    if (scope) for (const k of Object.keys(scope)) if (!Basics.P.scope.includes(k)) add(A, 'undeclared_field', 'scope.' + k);
    // a limit and a cap on each block are amounts of zero or more; nothing hides a limit. `every` goes with `limit` and `expires`; `fallback` is `lowest` and goes with `deadline`; `clocks` is { names, needed }
    if (scope) {
      for (const k of ['limit', 'each']) if (scope[k] !== undefined) { const c = amountProblem(scope[k]); if (c) add(A, c, 'scope.' + k); else if (Deals.decCmp(scope[k].value, '0') < 0) add(A, 'shape', 'scope.' + k + ' is zero or more'); }
      if (scope.on !== undefined) { if (!(Array.isArray(scope.on) && scope.on.every(x => Basics.isStr(x) && RX.id.test(x)))) add(A, 'grammar', 'scope.on lists ids'); else if (scope.on.some(x => idProblem(x) === 'unknown_suite')) add(A, 'unknown_suite', 'scope.on names a hash this reader does not know'); }
      if (scope.every !== undefined) { if (scope.limit === undefined) add(A, 'shape', 'scope.every goes with scope.limit'); if (scope.expires === undefined) add(A, 'required', 'scope.every goes with scope.expires'); }
      if (scope.fallback !== undefined) { if (!Basics.P.fallbacks.includes(scope.fallback)) add(A, 'shape', 'scope.fallback is lowest'); if (scope.deadline === undefined) add(A, 'shape', 'scope.fallback goes with scope.deadline'); }
      if ('clocks' in scope && Identity.clocksOf(scope.clocks) === null) add(A, 'shape', 'scope.clocks is { names, needed }');
      if ('ends_on' in scope) { const c = Grants.endsOnProblem(scope.ends_on); if (c) add(A, c, c === 'grammar' ? 'scope.ends_on.witness is an id' : 'scope.ends_on is { witness, said }, said text'); } // her own ending term
    }
    // a grant signed `as` a circle is no wider than the row that holds for it, as a child grant is no wider than its parent
    // a grant `as` a circle wider than its row is no finding of read: no row holds for it, so it waits (on: hands)
    // every grant that can bind (one with `scope.on` or `refs.what`) names its line (authority.md, `refs.meter`)
    if (!asAnswer && state.status === undefined && ((scope && scope.on !== undefined) || refs.what !== undefined) && refs.meter === undefined) add(A, 'required', 'a grant with scope.on or refs.what names its line in refs.meter');
    // a grant may carry scope.expires or not, whatever its kind: with one it ends then, with none it lasts until its author stops it
    if (refs.parent !== undefined) {
      const parent = given.get(refs.parent);
      if (parent) {
        // a circle that received it passes it on by a block signed as the circle; whether the signer may sign for it there is the fold's
        if (!Basics.isStr(parent.refs.to) || (parent.refs.to !== refs.author && parent.refs.to !== refs.as)) add(A, 'not_receiver', 'passed on by someone other than the receiver');
        const childCode = Grants.childProblem(state, refs, parent, given);
        if (childCode) add(A, childCode, childCode === 'shape' ? 'a child is never open and never to a role' : 'wider than the parent');
      }
    }
  }
}

// an IANA time zone name: UTC, or Area/Location (promises.md, Terms)
const zoneOk = z => Basics.isStr(z) && RX.zone.test(z);
// an RFC 5545 RRULE value: KEY=VALUE parts (grammar.rrule_part), exactly one of them FREQ from repeat.freq (RFC 7529 may name the calendar first, by RSCALE)
const rruleOk = r => { const parts = r.split(';'); return parts.every(x => RX.rrule_part.test(x)) && parts.filter(x => x.startsWith('FREQ=')).length === 1 && parts.some(x => x.startsWith('FREQ=') && Basics.P.repeat.freq.includes(x.slice(5))); };
// ---- scope subset rules (authority.md): a child's scope is a subset of its parent's on every field.
// Durations are compared by adding both to the same instant, the parent grant's at.
function parseDur(s) {
  if (!Basics.isStr(s) || !RX.duration.test(s)) return null; // 'P', 'PT' and 'P1DT' are no durations (grammar.duration)
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
const subsetOf = (a, b) => asList(a).every(x => asList(b).some(y => Bytes.jcs(x) === Bytes.jcs(y)));
// a sum of money in one currency, or of an amount in one unit, no larger than the parent's
const noLarger = (cv, pv) => Basics.isObj(pv) && 'unit' in pv ? (Basics.isObj(cv) && 'unit' in cv && Bytes.jcs(cv.unit) === Bytes.jcs(pv.unit) && Deals.decCmp(cv.value, pv.value) <= 0) : (Basics.isObj(cv) && Basics.isObj(pv) && !('unit' in cv) && Bytes.jcs(cv.currency) === Bytes.jcs(pv.currency) && Number.isInteger(cv.minor) && cv.minor <= pv.minor);
// the orders of protocol.json narrower_than; a duration is compared by adding both to `at`, the parent grant's own (with none there is no instant, and nothing is filled in)
const ORDER = {
  'subset-or-none': subsetOf,
  'at-most': noLarger,
  'at-most-time': (c, p) => !(c > p),
};
// narrowerThan(c, p, at, fields): the child's scope keeps to the parent's on every field the parent states (authority.md), each by its order
function narrowerThan(c, p, at, fields = Object.keys(Basics.P.narrower_than)) {
  // a field of the order subset-or-none left out names none (parties): a child that states more than a parent that states none is wider
  return fields.every(f => {
    const order = Basics.P.narrower_than[f], none = order === 'subset-or-none';
    const pv = p[f] === undefined && none ? [] : p[f], cv = c[f] === undefined && none ? [] : c[f];
    return pv === undefined || (cv !== undefined && ORDER[order](cv, pv, at));
  });
}
// ---- a machine's fence (authority.md, A machine's fence)
// an hour of day with its own offset, as a minute of the UTC day (0..1439); null outside grammar.hour
function hourMinute(s) {
  if (!Basics.isStr(s) || !RX.hour.test(s)) return null;
  const local = +s.slice(0, 2) * 60 + +s.slice(3, 5);
  const off = s[5] === 'Z' ? 0 : (s[5] === '-' ? -1 : 1) * (+s.slice(6, 8) * 60 + +s.slice(9, 11));
  return (((local - off) % 1440) + 1440) % 1440;
}
// the 1440 minutes a non-empty hours list covers; null when the list or an entry cannot be read (an entry of one minute twice is none)
function hoursCover(hours) {
  if (!Array.isArray(hours) || !hours.length) return null;
  const cover = new Array(1440).fill(false);
  for (const e of hours) {
    if (!Basics.isObj(e) || Object.keys(e).length !== 2 || !('from' in e) || !('to' in e)) return null;
    const s = hourMinute(e.from), f = hourMinute(e.to);
    if (s === null || f === null || s === f) return null;
    for (let m = 0; m < 1440; m++) if (s < f ? (m >= s && m < f) : (m >= s || m < f)) cover[m] = true;
  }
  return cover;
}
// ---- a machine lock (patterns/machines.md)
// A machine lock is a stop of a machine: a grant of kind `stop` whose `refs.subject` is the machine. It is the owner's word when it is backed by the machine's owner, as the ownership fold reads him in
// the lock's causal past: his own block, or one signed under a grant of his that covers the type `grant.stop` and that machine. It ends as anything ends: by its author's stop (or its own `scope.expires`
// against the reader's clock). Any other signer's stop of a machine is that signer's reading: shown, and locking nothing.
// machineLock(machine, blocks, now): { locked, locks, claimed }: locks the ids of the standing stops backed by the owner, claimed the ids of the other standing stops, each sorted
function machineLock(machine, blocks, now) {
  if (!Basics.isObj(machine)) throw Bytes.argError('argument 0 is the machine (a thing block)');
  const pool = new Pool([machine, ...poolOf(blocks).all().filter(x => x.hash !== machine.hash)]);
  const m = machine.hash;
  const isStop = b => b.type === 'grant' && b.state.kind === 'stop' && b.state.status === undefined && b.refs.answers === undefined && b.refs.subject === m && Identity.counts(b, pool);
  const locks = [], claimed = [];
  for (const lock of pool.all().filter(isStop).sort(Basics.byHash)) {
    if (!Grants.grantLive(lock, pool) || (now && Basics.isObj(lock.state.scope) && Basics.isStr(lock.state.scope.expires) && lock.state.scope.expires <= now)) continue;
    const owner = Things.ownershipFold(machine, pool, pool.past(lock.hash)).owner;
    (owner !== null && Consent.backedIn(lock, owner, pool).backed ? locks : claimed).push(lock.hash);
  }
  return { locked: locks.length > 0, locks, claimed };
}
// codes the write check finds in a grant's state.fence
function fenceProblems(env) {
  const out = [];
  if (!Basics.isObj(env)) return [['shape', 'state.fence is an object']];
  for (const k of Object.keys(env)) if (!['ranges', 'hours', 'safe_state', 'work_alone'].includes(k)) out.push(['undeclared_field', 'fence.' + k]);
  if ('ranges' in env) {
    if (!Array.isArray(env.ranges) || !env.ranges.length) out.push(['shape', 'fence.ranges']);
    else {
      const seen = [];
      for (const r of env.ranges) {
        const ok = Basics.isObj(r) && Object.keys(r).every(k => ['of', 'min', 'max'].includes(k)) && Basics.isStr(r.of) && r.of !== '' && !seen.includes(r.of) && ('min' in r || 'max' in r)
          && ['min', 'max'].every(k => !(k in r) || amountProblem(r[k]) === null)
          && (!('min' in r && 'max' in r) || (r.min.unit === r.max.unit && Deals.decCmp(r.min.value, r.max.value) <= 0));
        if (!ok) out.push(['shape', 'fence.ranges item']); else seen.push(r.of);
      }
    }
  }
  if ('hours' in env) {
    if (!Array.isArray(env.hours) || !env.hours.length) out.push(['shape', 'fence.hours']);
    else for (const e of env.hours) {
      if (!Basics.isObj(e) || Object.keys(e).length !== 2 || !Basics.isStr(e.from) || !Basics.isStr(e.to)) out.push(['shape', 'fence.hours item']);
      else if (hourMinute(e.from) === null || hourMinute(e.to) === null) out.push(['grammar', 'fence.hours hour']);
      else if (hourMinute(e.from) === hourMinute(e.to)) out.push(['shape', 'fence.hours item is one minute twice']);
    }
  }
  if ('safe_state' in env && !(Basics.isStr(env.safe_state) && env.safe_state !== '')) out.push(['shape', 'fence.safe_state']);
  if ('work_alone' in env && durationProblem(env.work_alone)) out.push(['time', 'fence.work_alone']);
  return out;
}
// is the child's fence (states of two grants) no wider than the parent's
function fenceWithin(child, parent) {
  const c = Basics.isObj(child.fence) ? child.fence : {}, p = Basics.isObj(parent.fence) ? parent.fence : {};
  if (p.ranges !== undefined) {
    for (const pr of p.ranges) {
      const cr = Array.isArray(c.ranges) ? c.ranges.find(x => Basics.isObj(x) && x.of === pr.of) : undefined;
      if (!cr) return false;
      for (const end of ['min', 'max']) {
        if (pr[end] === undefined) continue;
        if (cr[end] === undefined || cr[end].unit !== pr[end].unit) return false;
        const d = Deals.decCmp(cr[end].value, pr[end].value);
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
    // two spans are compared by what each adds to one fixed instant, never added to a date (authority.md, A range and a list; blocks.md, Time)
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
  const e = Basics.isObj(env) ? env : {}, why = [];
  if (e.hours !== undefined) {
    const cover = hoursCover(e.hours), minute = Math.floor(Date.parse(at) / 60000) % 1440;
    if (!cover[minute]) why.push({ code: 'outside_hours', of: null });
  }
  for (const r of e.ranges || []) {
    const said = Basics.isObj(readings) ? readings[r.of] : undefined;
    const unit = (r.min || r.max).unit;
    if (said === undefined || amountProblem(said) !== null || said.unit !== unit) { why.push({ code: 'unread', of: r.of }); continue; }
    if ((r.min && Deals.decCmp(said.value, r.min.value) < 0) || (r.max && Deals.decCmp(said.value, r.max.value) > 0)) why.push({ code: 'out_of_range', of: r.of });
  }
  const until = Basics.isStr(heard) ? addDur(heard, e.work_alone === undefined ? 'PT0S' : e.work_alone) : null;
  return { within: why.length === 0, why, alone: until !== null && Date.parse(at) <= Date.parse(until), alone_until: until };
}
function scopeWithin(child, parent) {
  const c = Basics.isObj(child.scope) ? child.scope : {}, p = Basics.isObj(parent.scope) ? parent.scope : {};
  if (!narrowerThan(c, p, Basics.isStr(parent.at) && parent.at !== '' ? parent.at : null)) return false;
  // a sealed limit is compared only where the amount is (the principal's node); here the child must still carry a limit
  if (p.limit_commitment !== undefined && c.limit_commitment === undefined && c.limit === undefined) return false;
  // a limit with no period covers all time: a child with a period under it could spend it again every period
  if (p.limit !== undefined && p.every === undefined && c.every !== undefined) return false;
  if (!fenceWithin(child, parent)) return false;
  // a grant that names a handle is passed on only to that handle
  if (parent.handle !== undefined && child.handle !== parent.handle) return false;
  const pd = parent.depth === undefined ? 0 : parent.depth, cd = child.depth === undefined ? 0 : child.depth;
  return pd >= 1 && cd <= pd - 1;
}

// ---- the codes of one check, in the order of protocol.json (refusals.codes.block; refusals.read)
const CODE_ORDER = Object.keys(Basics.P.refusals.codes.block);
const inCodeOrder = list => uniqueCodes(list).sort((a, b) => CODE_ORDER.indexOf(a.code) - CODE_ORDER.indexOf(b.code));
const READ_ORDER = [...Basics.P.refusals.read, 'type_name', 'after_limit', 'audience', 'bad_genesis', 'at_missing', 'unknown_suite', 'unknown_rules']; // the codes that moved to `read`
// read's codes, in the order of protocol.json refusals.read, which lists every code read gives (check 7 finds shape, grammar, decimal, time and calendar in a closed block's
// terms, scope, condition and epoch too).
const readRank = c => (READ_ORDER.includes(c) ? READ_ORDER.indexOf(c) : 100 + CODE_ORDER.indexOf(c));
const inReadOrder = list => uniqueCodes(list).sort((a, b) => readRank(a.code) - readRank(b.code));
// A block as a writer must write it: checks 1 to 4, then, for a closed type, check 7 with no block given and no schema. (What the pure functions read: pureJunk.)
// a writer signs only what its own `read` reads: what `valid` finds of the bytes, else every code `read` finds with nothing given (the values, the closed type, the rule set).
function writeFindings(block, given) {
  const early = validCheck(block, { writer: true });
  if (early.length) return inCodeOrder(early);
  const b = blockOnly(block), found = valueCheck(b, {}).map(f => ({ stage: f.stage, code: f.code, detail: f.detail }));
  const givenMap = new Map((Array.isArray(given) ? given : []).filter(x => Basics.isObj(x) && Basics.isStr(x.hash)).map(x => [x.hash, x]));
  if (CLOSED.has(b.type) && !Bytes.readsAsGenesis(b)) closedFindings(b, { blocks: givenMap, schemas: new Map() }, (stage, code, detail) => found.push({ stage, code, detail }));
  if (Basics.isObj(b.state) && b.state.rule_set !== undefined && !runsSet(b.state.rule_set)) found.push({ stage: 9, code: 'unknown_rules', detail: 'state.rule_set names a set this reader does not run' });
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
    if ((c === '{' || c === '[') && d + 1 > Basics.READ_DEPTH) fail('too deep'); // a carrier of more than limits.read_depth levels
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
    for (const [w, v] of [['true', true], ['false', false]]) if (text.startsWith(w, i)) { i += w.length; return v; } // there is no null
    fail('not JSON');
  };
  try {
    const v = value(0);
    if (i !== text.length) fail('bytes after the value');
    if (Bytes.jcs(v) !== text) fail('not the canonical bytes of the value');
    return { ok: true, value: v };
  } catch (e) { return { ok: false, why: String(e && e.message) }; }
}
// a refusal of strict_text and strict_push carries `hash`, the SHA-256 of the bytes as they came (canonical.md, A refusal names bytes), beside code and detail.
const named = (text, list) => { const hash = Bytes.sha256(Buffer.from(typeof text === 'string' ? text : '', 'utf8')); return list.map(f => ({ hash, code: f.code, detail: f.detail || '' })); };
// strict_text: a block as TEXT, what its bytes alone say (checks 1 to 4). The two limits are read on the bytes first (size_limit, nothing else read); then the bytes
// must be the canonical bytes of a strict value (not_canonical); then the values. A refusal names the bytes: its hash is the SHA-256 of the bytes as they came.
function strictText(text) {
  if (typeof text !== 'string') throw Bytes.argError('a block as text is text');
  let d = 0, most = 0, inStr = false;
  for (let j = 0; j < text.length; j++) { const c = text[j]; if (inStr) { if (c === '\\') j++; else if (c === '"') inStr = false; } else if (c === '"') inStr = true; else if (c === '[' || c === '{') most = Math.max(most, ++d); else if (c === ']' || c === '}') d = Math.max(0, d - 1); }
  if (Buffer.byteLength(text, 'utf8') > Basics.P.limits.block_bytes || most > Basics.P.limits.depth) return named(text, [{ code: 'size_limit', detail: 'its bytes are over limits.block_bytes or open more than limits.depth levels' }]);
  const r = wireParse(text);
  if (!r.ok) return named(text, [{ code: 'not_canonical', detail: r.why }]);
  // strict_text is what the bytes alone say: the first three checks of `valid` (size, bytes, header); the values are `read`'s
  return named(text, inCodeOrder(validCheck(r.value, {})));
}

// A push read from its bytes (nodes.md, Push): every message, signed or not, holds only what strict writing allows (no float, no null, no whole number past 2^53 - 1); a push is exactly
// { messages, for }; `limits.push_bytes` and `limits.push_messages` are read on the bytes first, and a carrier deeper than `limits.read_depth` is refused whole before any block in it is read.
// The answer is one list per message, plus one field for a refusal of the whole push: { refused: { hash, code, detail }, messages: [] } or { messages: [[refusal,...],...] }
// (`refused` is left out where the whole push is not refused; the one form has no null). The limits are 8 MiB and 1024 messages. the whole
// push is refused as `size_limit` for a limit and as `not_canonical` for anything else (bytes, an extra or missing top key, a float, a null).
const PUSH_LIMITS = { push_bytes: Basics.P.limits.push_bytes, push_messages: Basics.P.limits.push_messages };
function strictPush(text) {
  if (typeof text !== 'string') throw Bytes.argError('a push is JSON text');
  const refusedWhole = (code, detail) => ({ refused: named(text, [{ code, detail }])[0], messages: [] });
  if (Buffer.byteLength(text, 'utf8') > PUSH_LIMITS.push_bytes) return refusedWhole('size_limit', 'over limits.push_bytes');
  const r = wireParse(text);
  if (!r.ok) return refusedWhole(r.why === 'too deep' ? 'size_limit' : 'not_canonical', r.why);
  const v = r.value;
  if (!Basics.isObj(v) || !Array.isArray(v.messages) || Object.keys(v).some(k => k !== 'messages' && k !== 'for')) return refusedWhole('not_canonical', 'a push is exactly { messages, for }, `for` left out where it says nothing');
  if (v.messages.length > PUSH_LIMITS.push_messages) return refusedWhole('size_limit', 'over limits.push_messages');
  // the push is canonical whole, so the bytes of each block are the canonical bytes of its value, as they came
  return { messages: v.messages.map(m => (Basics.isObj(m) && 'block' in m ? strictText(Bytes.jcs(m.block)) : [])) };
}

// ================================================================ blocks given, causal past (blocks.md)
// A block's causes: every block it names in refs, and the block it counts to (protocol.json causal_state).
const refIds = b => { const out = []; for (const v of Object.values(b.refs || {})) for (const x of asList(v)) if (Basics.isStr(x)) out.push(x); for (const k of Basics.P.causal_state) if (b.state && Basics.isStr(b.state[k])) out.push(b.state[k]); return out; };
// the ids a block's body names, what a block given and not read hides: each id in its refs, but not its line's own links (its author, the block before it, its key, `after`)
const namedIds = b => { const out = []; for (const [k, v] of Object.entries(b.refs || {})) if (!['author', 'prev', 'key', 'after'].includes(k)) for (const x of asList(v)) if (Basics.isStr(x)) out.push(x); return out; };
// What a block names for its meaning (protocol.json needs): refs.under, answers, updates, for, and by type its schema, the grant it passes on, the block it
// counts to, a grant's scope.on. `read` waits for these and `valid` for none of them: never its author or its prev (core.md, section 8). Ascending.
function needsOf(b) {
  const out = [];
  for (const path of [...Basics.P.needs.every, ...(tableEntry(Basics.P.needs, b.type) || [])]) {
    const [side, key] = path.split('.');
    const root = side === 'refs' ? b.refs : side === 'state' ? b.state : (Basics.isObj(b.state) ? b.state[side] : undefined); // `scope.on` is state.scope.on
    const v = Basics.isObj(root) ? root[key] : undefined;
    for (const x of asList(v)) if (Basics.isStr(x) && x !== '' && !out.includes(x)) out.push(x);
  }
  return out.sort(); // nodes.md, Push: needs ascending
}

// ================================================================ what a reader holds: valid, read, or kept as its header (core.md, section 8)
// An entry is a whole block { hash, type, state, refs, signature } or a block given by its header alone: { hash, state: { seq, audience: ['sealed'], skip? },
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
// a sealed message { header, header_signature, envelope? } as the entry it is given as: a header and its signature, nothing more.
// a header given of a key grant that shows its own key (shown_key) cannot be opened by that key, for the key is in the body: it waits on its body (core.md, section 8, The key that opens it)
function headerEntry(m) {
  const h = m && m.header;
  if (!Basics.isObj(h)) return null;
  const out = { hash: h.hash, state: { seq: h.seq, audience: ['sealed'] }, refs: { author: h.author, prev: h.prev } };
  if ('key' in h) out.keyId = h.key;
  for (const flag of ['skip']) if (flag in h) out.state[flag] = h[flag];
  if (Object.keys(h).some(k => !Basics.P.header.includes(k) && !Basics.P.header_optional.includes(k)) || Basics.P.header.some(k => !(k in h))) out.bad_header = true;
  if (m.header_signature !== undefined) out.header_signature = m.header_signature;
  return out;
}
// the entries of a list of blocks and sealed messages: a header that carries its body (kept as a header by an earlier reading) is that body again
function normEntries(list) {
  const out = [];
  for (const x of list || []) {
    if (!x) continue;
    if (x.type === undefined && x._body) out.push(x._body);
    else if (x.type === undefined && Basics.isObj(x.header) && x.state === undefined) { const e = headerEntry(x); if (e) out.push(e); }
    else if (x.hash && Basics.isObj(x.state) && Basics.isObj(x.refs)) out.push(x);
  }
  return out;
}
// by id, a whole block over a header of one hash (two halves of one block, never a duplicate; privacy.md)
function buildIdx(entries) {
  const idx = new Map();
  for (const e of entries) { const o = idx.get(e.hash); if (!o || (o.type === undefined && e.type !== undefined)) idx.set(e.hash, e); }
  return idx;
}
// A block's pieces (core.md, section 8, check 5): its author's genesis, the block its refs.key names, and that block's pieces. Nothing else. `lack` lists the ids not given
// with a body (ascending): a piece given only as its header names no key, so it is not given.
function piecesOf(e, idx) {
  const have = [], lack = new Set(), seen = new Set(), stack = [];
  const push = id => { if (Basics.isStr(id) && !seen.has(id)) { seen.add(id); stack.push(id); } };
  push(e.refs.author); push(keyRefOf(e));
  while (stack.length) {
    const id = stack.pop(), p = bodyOf(idx.get(id));
    if (!p) { lack.add(id); continue; }
    have.push(id);
    if (Bytes.isGenesisBlock(p)) continue;
    push(p.refs && p.refs.author); push(p.refs && p.refs.key);
  }
  return { have, lack: [...lack].sort() };
}
// the keys and values of a header given (core.md, section 8: shape)
function headerShape(e) {
  const bad = [];
  if (e.bad_header) bad.push('a header is exactly author, seq, prev and hash, with key or skip');
  if (!Number.isInteger(e.state.seq) || e.state.seq < 1) bad.push('seq');
  for (const [k, v] of [['author', e.refs.author], ['prev', e.refs.prev], ['hash', e.hash], ['key', e.keyId]]) if (v !== undefined || k !== 'key') { const p = idProblem(v); if (p) return [{ stage: 2, code: p === 'unknown_suite' ? 'unknown_suite' : 'chain', detail: 'header ' + k }]; }
  for (const f of ['skip']) if (f in e.state && e.state[f] !== true) bad.push(f);
  if (!Basics.isStr(e.header_signature)) bad.push('header_signature');
  return bad.length ? [{ stage: 2, code: 'chain', detail: 'a header: ' + bad.join(', ') }] : [];
}
// The signed bytes of an entry for a key of `suite`: a whole block's header (the hash in that suite), a header given as it stands (canonical JSON of the header as held).
const sigBytesOf = (x, suite) => (x.type === undefined ? Buffer.from(Bytes.jcs(Identity.header(x)), 'utf8') : Bytes.signedBytes(x, suite));
const sigOf = x => (x.type === undefined ? x.header_signature : x.signature);
const entryOpens = (x, key, suite) => Basics.isStr(sigOf(x)) && Bytes.verifyBytes(sigBytesOf(x, suite), sigOf(x), key, suite);
// judge(e, ctx): `valid` for one entry: { stage, findings, needs }. ctx = { idx, memo, stack }. Checks 1 to 4 on the bytes and values, 5 the pieces (core.md, section 8, check 5: one
// not given, or given only as its header, is `unmet`; one given that waits on a suite makes the block wait the same, `unknown_suite`; one given and refused is `bad_piece`, final), 6 the
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
  if (full && Bytes.isGenesisBlock(b)) {
    const key = b.state.public_key_sign, w = [];
    // the id is the hash of the bytes in its key's suite: a wrong id is `bad_hash` alone, never with `bad_signature`. A key spelled no way a suite writes opens nothing (bad_signature).
    // a genesis that names a suite this reader does not know waits (unknown_suite); else its id is the hash of its bytes in its own suite (bad_hash), and then its own key opens it
    const ks = Bytes.suiteOfKey(key), named = Basics.isStr(b.state.suite) ? b.state.suite : 'std';
    if (ks === null && !Basics.SUITES.includes(named)) return found(6, [{ code: 'unknown_suite', detail: 'a suite this reader does not know' }]);
    if (e.hash !== undefined && Bytes.hashOfBlock(b, ks || named) !== e.hash) w.push({ code: 'bad_hash', detail: 'the id is not the hash of the canonical bytes in its key\'s suite' });
    else if (ks === null || !Basics.isStr(e.signature) || !Bytes.verifyBlock(b, e.signature, key)) w.push({ code: 'bad_signature', detail: 'a genesis opens with its own key over its own bytes; a key spelled as no suite spells a key opens nothing' });
    return found(6, w);
  }
  const { have, lack } = piecesOf(e, ctx.idx);
  const refusedPieces = [], waits = [];
  for (const id of have) { const r = judge(bodyOf(ctx.idx.get(id)), ctx); if (r.findings.length) { if (r.findings.every(f => Identity.PAIR_CODES.includes(f.code))) { if (r.findings.some(f => f.code === 'unknown_suite')) waits.push(id); } else refusedPieces.push(id + ' (' + inCodeOrder(r.findings)[0].code + ')'); } }
  const w5 = [];
  if (lack.length) w5.push({ code: 'unmet', detail: 'pieces not held: ' + lack.join(', ') });
  if (refusedPieces.length) w5.push({ code: 'bad_piece', detail: 'a piece it rests on is refused: ' + refusedPieces.sort().join(', ') });
  if (waits.length) w5.push({ code: 'unknown_suite', detail: 'a piece waits on a suite this reader does not know: ' + waits.sort().join(', ') });
  if (w5.length) return found(5, w5, lack);
  const author = e.refs.author, kref = keyRefOf(e), bodyAt = { get: h => bodyOf(ctx.idx.get(h)) };
  const showsFromGenesis = full && kref === author && isKeyGrant(b) && Basics.isStr(b.state.shown_key);
  // a header whose pieces' list names a key by its hash may be a key grant whose key is shown only in its body: it cannot be checked from the
  // header, so it waits on its body (`unmet`, naming its own id)
  const holderList = kref === undefined ? null : listOfBlock(bodyAt.get(kref), author);
  const hides = !!holderList && Array.isArray(holderList.voices) && holderList.voices.some(v => Basics.isObj(v) && Basics.isStr(v.key_hash));
  const waitBody = () => found(5, [{ code: 'unmet', detail: 'pieces not held: ' + e.hash }], [e.hash]);
  if (!full && kref === author && hides) return waitBody();
  if (kref !== undefined && !showsFromGenesis && !keyGrantOf(bodyAt.get(kref), author)) return found(6, [{ code: 'bad_signature', detail: 'refs.key is not a key grant of this author about this author' }]);
  const cands = resolveKeys(e, bodyAt);
  let unknown = false, hit = null;
  // an id that is not the hash of the bytes in the suite of any key its pieces name is `bad_hash` alone (a forged block never gets both codes)
  if (full && e.hash !== undefined) { const known = cands.filter(c => Basics.SUITES.includes(c.suite) && Bytes.keyGrammar(c.suite).test(c.key)); if (known.length && known.length === cands.length && !known.some(c => Bytes.hashOfBlock(b, c.suite) === e.hash)) return found(6, [{ code: 'bad_hash', detail: 'the id is not the hash of the canonical bytes in its key\'s suite' }]); }
  for (const c of cands) {
    if (!Basics.SUITES.includes(c.suite) || !Bytes.keyGrammar(c.suite).test(c.key)) { unknown = true; continue; }
    if (!hit && entryOpens(e, c.key, c.suite)) hit = c;
  }
  // a place this reader cannot read brings in nothing and refuses nothing: `bad_signature` is given only when every place the pieces offer is one this reader can read
  if (!hit && !unknown && kref !== undefined) { const kgb = bodyAt.get(kref); if (kgb && Basics.isObj(kgb.state) && ((Basics.isStr(kgb.state.suite) && !Basics.SUITES.includes(kgb.state.suite)) || (Array.isArray(kgb.state.voices) && kgb.state.voices.some(v => Basics.isObj(v) && ((Basics.isStr(v.suite) && !Basics.SUITES.includes(v.suite)) || (Basics.isStr(v.key) && !(Basics.SUITES.includes(v.suite || 'std') && Bytes.keyGrammar(v.suite || 'std').test(v.key)))))))) unknown = true; }
  if (!hit && !full && hides && !unknown) return waitBody();
  if (!hit) return found(6, [{ code: unknown ? 'unknown_suite' : 'bad_signature', detail: unknown ? 'a key in a suite this reader does not know' : 'no key its pieces name opens the signature over its header' }]);
  // the signature is read over the header that names the block by the id a reader computes, never one it was sent (core.md, section 1); an id sent that is not that id is `bad_hash`
  if (full && e.hash !== undefined && Bytes.hashOfBlock(b, hit.suite) !== e.hash) return found(6, [{ code: 'bad_hash', detail: 'the id is not the hash of the canonical bytes in its key\'s suite' }]);
  return { stage: 0, findings: [], needs: [] };
}
// the schema store of whole blocks: every thing of kind schema, once per id (core.md, section 8)
// the fields a schema declares, as [name, spec]: `fields` is an object { name: spec } or a list of `name:spec` lines. A spec is a shape word (text, hash, id, time, date,
// duration, decimal, amount, count) or `in:` and a comma list, a trailing `!` asking for the field; any other spec is a hint for people and checks nothing. `in:a,b,c` (one comma-separated list). (the text does not say; read so)
const schemaFieldSpecs = sch => {
  const f = sch && sch.state && sch.state.fields;
  if (Basics.isObj(f)) return Object.entries(f).map(([k, v]) => [k, Basics.isStr(v) ? v : '']);
  if (Array.isArray(f)) return f.filter(Basics.isStr).map(l => { const i = l.indexOf(':'); return i < 0 ? [l, ''] : [l.slice(0, i), l.slice(i + 1)]; });
  return [];
};
const SHAPE_WORDS = ['text', 'hash', 'id', 'time', 'date', 'duration', 'decimal', 'amount', 'count'];
function typedFieldFindings(state, sch) {
  const out = [];
  for (const [name, spec0] of schemaFieldSpecs(sch)) {
    const asked = spec0.endsWith('!'), spec = asked ? spec0.slice(0, -1) : spec0;
    if (!SHAPE_WORDS.includes(spec) && !spec.startsWith('in:')) continue;
    const v = name.split('.').reduce((o, k) => (Basics.isObj(o) && k in o ? o[k] : undefined), state);
    if (v === undefined) { if (asked) out.push({ stage: 2, code: 'required', detail: 'state.' + name + ' is asked for by the schema it names' }); continue; }
    const ok = spec === 'text' ? Basics.isStr(v) : spec === 'hash' ? Basics.isStr(v) && RX.hash.test(v) : spec === 'id' ? Basics.isStr(v) && RX.id.test(v) : spec === 'time' ? Basics.isStr(v) && timeProblem(v) === null
      : spec === 'date' ? dateProblem(v) === null : spec === 'duration' ? Basics.isStr(v) && !!parseDur(v) : spec === 'decimal' ? Basics.isStr(v) && RX.decimal.test(v)
      : spec === 'amount' ? amountProblem(v) === null : spec === 'count' ? Number.isInteger(v) && v >= 1 : Basics.isStr(v) && spec.slice(3).split(',').includes(v);
    if (!ok) out.push({ stage: 2, code: 'shape', detail: 'state.' + name + ' is not ' + spec + ', as the schema it names says' });
  }
  return out;
}
const schemasMap = list => new Map(list.filter(b => Basics.isObj(b) && b.type === 'thing' && Basics.isObj(b.state) && b.state.kind === 'schema' && Basics.isStr(b.hash)).map(b => [b.hash, b]));
// read(b): the codes of one valid block against what is given and read (core.md, section 8): names_missing, names_unread (naming the ids in the detail; `needs` gives them), then check 7.
function readCodes(b, st) {
  const miss = [], unread = [], out = [];
  for (const id of needsOf(b)) { if (!st.idx.has(id)) miss.push(id); else if (!(st.validE.has(id) && st.status.get(id) === 'read')) unread.push(id); }
  if (miss.length) out.push({ stage: 0, code: 'names_missing', detail: 'not held: ' + miss.join(', ') });
  if (unread.length) out.push({ stage: 0, code: 'names_unread', detail: 'held and not valid or not read: ' + unread.join(', ') });
  // every judgement of a value is `read`'s: the codes that left `valid` (the grammar and shape of every value, in any type, a genesis's own values, the audience, the date)
  for (const f of valueCheck(blockOnly(b), {})) out.push({ stage: f.stage, code: f.code, detail: f.detail });
  if (CLOSED.has(b.type) && !Bytes.readsAsGenesis(b)) closedFindings(blockOnly(b), { blocks: st.bodies, schemas: st.schemas }, (stage, code, detail) => out.push({ stage, code, detail }));
  // a block of any type that names a schema it holds, and carries a field the schema types in another shape (or lacks one it asks for), is not read (`shape`, `required`)
  { const sch = Basics.isObj(b.refs) && Basics.isStr(b.refs.schema) && st.schemas ? st.schemas.get(b.refs.schema) : undefined; if (sch && Basics.isObj(b.state)) for (const f of typedFieldFindings(b.state, sch)) out.push(f); }
  // `state.rule_set` is a field of every type; a block that states a set this build is not made from is not read (`unknown_rules`)
  if (Basics.isObj(b.state) && b.state.rule_set !== undefined && !runsSet(b.state.rule_set)) out.push({ stage: 9, code: 'unknown_rules', detail: 'state.rule_set names a set this reader does not run' });
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
    // a block given with its body that this reader cannot judge yet (a piece not given, a suite it does not know) is no part of any fold; a fold asked about what its body names answers not_shown
    this.unjudged = [...r.idx.values()].filter(e => e.type !== undefined && !r.validE.has(e.hash) && judge(e, r.ctx).findings.length && judge(e, r.ctx).findings.every(f => Identity.PAIR_CODES.includes(f.code)));
  }
  get(h) { return this.m.get(h); }
  // the body of a block given, a block kept as its header too: for the pieces of another block alone (core.md, section 8)
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
const earliest = (list, pool) => list.filter(x => !list.some(y => y !== x && pool.sees(x.hash, y.hash))).sort(Basics.byHash);
// latest(set): the causal maxima, the blocks no other of the set sees
const latest = (list, pool) => list.filter(x => !list.some(y => y !== x && pool.sees(y.hash, x.hash)));
const poolOf = x => x instanceof Pool ? x : new Pool(x);
const blockOnly = b => { const o = {}; for (const k of ['type', 'state', 'refs']) if (k in b) o[k] = b[k]; return o; };

// ================================================================ a block's id (core.md, section 2)
// The suite a block shows by itself, a reader's guess that `valid` never uses (door op id_of): a genesis names its own; any other block is hashed as the key it names was
// brought in, so the hash name of its refs.key, else of its refs.author (a bare hash is SHA-256, which std names).
function suiteFromBlock(b) {
  if (b.type === 'actor' && b.refs && b.refs.author === undefined) return Basics.SUITES.includes(b.state && b.state.suite) ? b.state.suite : 'std';
  const named = b.refs && (Basics.isStr(b.refs.key) ? b.refs.key : b.refs.author);
  return Basics.isStr(named) && named.startsWith('sm3:') ? 'sm' : 'std';
}
// The suite of the key that signed a block: a genesis's own; else the key its pieces name that opens its signature over its header. null when none does.
function signedSuite(b, pool) {
  if (b.type === 'actor' && b.refs && b.refs.author === undefined) return suiteFromBlock(b);
  if (!Basics.isStr(b.refs && b.refs.author)) return null;
  const s = signerFrom(b, pool);
  return s ? s.suite : null;
}
// A block's id: the hash of its canonical bytes in the suite of the key its pieces name, read among the blocks given; else in the suite the block shows.
function idOf(b, given) {
  const suite = (given ? signedSuite(b, poolOf(given)) : null) || suiteFromBlock(b);
  return Bytes.hashOfBlock(blockOnly(b), suite);
}

// ================================================================ who signed a block, read from what it rests on alone (core.md, sections 5 and 8; identity.md, refs.key)
// A genesis that opens with its own key.
const soundGenesis = g => !!g && g.type === 'actor' && g.refs.author === undefined && Basics.isStr(g.state.public_key_sign) && (!Array.isArray(g.state.voices) || g.state.voices.some(v => Basics.isObj(v) && v.key === g.state.public_key_sign)) && g.state.seq === undefined && Basics.isStr(g.signature) && Bytes.verifyBytes(Buffer.from(Bytes.canonOf(g), 'utf8'), g.signature, g.state.public_key_sign, g.state.suite || 'std');
// autonomous(id, pool): an autonomous system is an actor of kind agent or machine (identity.md, consent.md)
const autonomous = (id, pool) => { const g = pool.get(id); return !!g && ['agent', 'machine'].includes(g.state.kind); };
const isKeyGrant = b => b.type === 'grant' && b.state && b.state.kind === 'key';
// a key grant about the identity: `refs.subject` her id, no status (a block with a status is a stop or an answer, never a grant: authority.md)
const keyGrantOf = (b, id) => !!b && isKeyGrant(b) && b.refs.subject === id && b.state.status === undefined;
// identity.md, Her voices: the suite's hash of a key's SPKI hex as UTF-8 text
const keyHash = (spki, suite) => Bytes.hashStr(suite || 'std', spki);
const isZeroDur = d => { const p = parseDur(d); return !!p && Object.values(p).every(n => n === 0); };
// The list a block states (identity.md, Her voices): the genesis (a list of one voice, its own key) or a key grant that states `voices`.
function listOfBlock(b, id) {
  if (!b) return null;
  if (b.hash === id && soundGenesis(b) && Array.isArray(b.state.voices)) return { hash: id, voices: b.state.voices, clocks: b.state.clocks !== undefined ? b.state.clocks : null }; // a genesis may state her whole list
  if (b.hash === id) return soundGenesis(b) ? { hash: id, voices: [{ key: b.state.public_key_sign, ...(b.state.suite !== undefined ? { suite: b.state.suite } : {}), ...(b.state.reach !== undefined ? { reach: b.state.reach } : {}) }], clocks: b.state.clocks !== undefined ? b.state.clocks : null } : null;
  if (keyGrantOf(b, id) && Array.isArray(b.state.voices)) return { hash: b.hash, voices: b.state.voices, clocks: b.state.clocks !== undefined ? b.state.clocks : null };
  return null;
}
// the key_hash voice of a list that a key hashes to (its suite's hash of the SPKI hex), or undefined
// a hidden voice `{ key_hash }` names a key by the hash of its SPKI text with no `suite` field: the hash name says which hash (`sm3:` is the sm hash, a bare 64 hex is std); the key shows its own suite
const hashNamesKey = (hashName, spki) => Basics.isStr(hashName) && Basics.isStr(spki) && keyHash(spki, hashName.startsWith('sm3:') ? 'sm' : 'std') === hashName;
const matchHash = (list, key) => (list ? list.voices.find(v => Basics.isObj(v) && Basics.isStr(v.key_hash) && Basics.isStr(key) && hashNamesKey(v.key_hash, key)) : undefined);
// The keys a block brings in for an author (core.md, section 5; protocol.json, refs.key): the genesis's own; each `key` voice of the list a key grant states;
// the one `public_key_sign` a key grant adds under a voice. (A key named by hash comes in by showing itself: resolveKeys.)
function keysBroughtBy(p, author) {
  if (!p) return [];
  if (p.hash === author) return soundGenesis(p) ? (Array.isArray(p.state.voices) ? p.state.voices.filter(v => Basics.isObj(v) && Basics.isStr(v.key)).map(v => ({ key: v.key, suite: v.suite || 'std' })) : [{ key: p.state.public_key_sign, suite: p.state.suite || 'std' }]) : [];
  if (!keyGrantOf(p, author)) return [];
  const out = [];
  if (Array.isArray(p.state.voices)) { for (const v of p.state.voices) if (Basics.isObj(v) && Basics.isStr(v.key)) out.push({ key: v.key, suite: v.suite || 'std' }); }
  else if (Basics.isStr(p.state.public_key_sign)) out.push({ key: p.state.public_key_sign, suite: p.state.suite || 'std' });
  return out;
}
// The keys a block's refs.key makes candidates for its signature (identity.md, refs.key): with no refs.key, the author's genesis key; else the keys of the key
// grant it names: each key voice of its list, the one key it adds under a voice, and the key a hash voice shows. A key named by hash speaks first in the key
// grant that shows it, which names in refs.key the list that holds the hash; its later blocks name that showing key grant.
function resolveKeys(b, pool) {
  const author = b.refs.author, kref = keyRefOf(b), at = h => (pool.body ? pool.body(h) : pool.get(h));
  if (kref === undefined) { const root = at(author); return soundGenesis(root) ? keysBroughtBy(root, author) : []; }
  const kg = at(kref);
  // a key grant that shows a key named by hash in her genesis list names the genesis in refs.key (core.md, section 5)
  if (kref === author && isKeyGrant(b) && Basics.isStr(b.state.shown_key)) { const hv = kg && soundGenesis(kg) ? matchHash(listOfBlock(kg, author), b.state.shown_key) : null; return hv ? [{ key: b.state.shown_key, suite: Bytes.suiteOfKey(b.state.shown_key) || 'std' }] : []; }
  if (!kg || !keyGrantOf(kg, author)) return [];
  const out = keysBroughtBy(kg, author);
  // the block itself shows the key: a key grant stating shown_key, whose refs.key names the list that holds the key's hash
  if (isKeyGrant(b) && Basics.isStr(b.state.shown_key)) { const hv = matchHash(listOfBlock(kg, author), b.state.shown_key); if (hv) out.push({ key: b.state.shown_key, suite: Bytes.suiteOfKey(b.state.shown_key) || 'std' }); }
  // a later block of a shown key names the key grant that showed it: the key stated in its shown_key, when that grant's own refs.key names a list with the hash
  if (Basics.isStr(kg.state.shown_key)) { const hv = matchHash(listOfBlock(at(kg.refs.key), author), kg.state.shown_key); if (hv) out.push({ key: kg.state.shown_key, suite: Bytes.suiteOfKey(kg.state.shown_key) || 'std' }); }
  return out;
}
// The signer of a block: { key, suite } read from what its pieces name alone (refs.key, or the genesis key), the key that opens its signature over its header (a header given's
// too: the header carries `key`); null when none does. It reads no prev and no seq: where the block sits on its line is the line's question. Cached for a block of the pool.
function signerFrom(b, pool) {
  // a block whose state or refs is not an object is refused by its bytes (core.md, check 1) and has no signer to read
  if (!Basics.isObj(b.state) || !Basics.isObj(b.refs) || !Basics.isStr(b.refs.author)) return null;
  pool._sg = pool._sg || new Map();
  const mine = pool.get(b.hash) === b;
  if (mine && pool._sg.has(b.hash)) return pool._sg.get(b.hash);
  const open = resolveKeys(b, pool).find(c => Basics.SUITES.includes(c.suite) && entryOpens(b, c.key, c.suite));
  const out = open ? { key: open.key, suite: open.suite } : null;
  if (mine) pool._sg.set(b.hash, out);
  return out;
}

// ================================================================ valid(block, blocks) and read(block, blocks) (core.md, section 8)
// valid: who said these bytes. block: a whole { hash?, type, state, refs, signature } or a header given { header, header_signature }; blocks: the blocks given (an array, a Map or a
// Pool; whole blocks and sealed messages). Returns refusals [{ code, detail }] of the first check that finds anything, one per code, in protocol.json's order; `unmet` and
// `unknown_suite` are waits, not refusals. It reads only the block's pieces: no prev, no other link, no schema, no clock.
function uniqueCodes(list) { const seen = new Set(), out = []; for (const f of list) if (!seen.has(f.code)) { seen.add(f.code); out.push({ code: f.code, detail: f.detail || '' }); } return out; }
const blockList = h => (!h ? [] : h instanceof Pool ? h.all() : h instanceof Map ? [...h.values()] : Array.isArray(h) ? h : []);
function validStages(block, given) {
  if (!Basics.isObj(block)) return { stage: 1, findings: [{ stage: 1, code: 'not_canonical', detail: 'not a block' }], needs: [] };
  const isMsg = block.type === undefined && Basics.isObj(block.header) && block.state === undefined;
  // a value with a state or refs and no type is a block that lacks its type (core.md, section 8, bytes: a block is exactly { type, state, refs }),
  // never a header given
  if (!isMsg && block.type === undefined && (block.state !== undefined || block.refs !== undefined)) return { stage: 2, findings: [{ stage: 2, code: 'not_canonical', detail: 'a block is exactly { type, state, refs }: this one has no type' }], needs: [] };
  const own = isMsg ? headerEntry(block) : block;
  const entries = normEntries(blockList(given));
  const ctx = { idx: buildIdx(entries), memo: new Map(), stack: new Set() };
  return judge(own, ctx, true);
}
function valid(block, given) { return inCodeOrder(validStages(block, given).findings); }
// read: whether this reader can read a block that is valid; every code it finds (names_missing, names_unread, then check 7). `schemas` is the store check 7 reads; with none
// (null) it is the schema store of the blocks given (schemas_from; core.md, section 8).
// A build runs the one rule set its manifest names (core.md, section 11): H0, whose id is written by leaving `state.rule_set` out. This build was
// given no manifest (no spec/rule-set.json before the lock), so it names no id, and a block that states any id is `unknown_rules`.
const BUILT_FROM = null;
const runsSet = id => BUILT_FROM !== null && id === BUILT_FROM;
function readFindings(block, given, schemasIn) {
  if (!Basics.isObj(block) || block.type === undefined || !Basics.isObj(block.state) || !Basics.isObj(block.refs)) throw Bytes.argError('read is asked of a whole block');
  return readFindingsNow(block, given, schemasIn);
}
function readFindingsNow(block, blocksIn, schemasIn) {
  const given = normEntries(blockList(blocksIn)), own = { ...block };
  if (own.hash === undefined) own.hash = idOf(own, given);
  const r = classify([...given.filter(e => e.hash !== own.hash), own], { schemas: Array.isArray(schemasIn) ? blockMap(schemasIn) : undefined });
  if (!r.validE.has(own.hash)) throw Bytes.argError('read is asked of a block that is not valid');
  return r.codes.get(own.hash) || [];
}
Object.assign(module.exports, { RX, KNOWN_HASH_PREFIX, CLOSED, SHARED_REFS, STATUSES, FIELDS_EVERY, tableEntry, baseFields, dim, realDate, realTime, lonePair, MAXI, blockMap, asList, linesOf, quantityOf, whatsOf, idProblem, timeProblem, dateProblem, durationProblem, has, amountProblem, perUnit, figureProblems, priceProblems, quantityProblems, shapeOf, shapeValue, shapeFindings, voicesFindings, contentFindings, closedFindings, parseDur, spanMs, addDur, subsetOf, ORDER, machineLock, fenceReading, scopeWithin, CODE_ORDER, inCodeOrder, READ_ORDER, writeFindings, named, strictText, strictPush, refIds, namedIds, needsOf, keyRefOf, asHeader, headerEntry, normEntries, buildIdx, piecesOf, sigOf, judge, readCodes, classify, Pool, quorum, panelOf, earliest, latest, poolOf, blockOnly, suiteFromBlock, idOf, soundGenesis, autonomous, isKeyGrant, keyGrantOf, keyHash, isZeroDur, listOfBlock, hashNamesKey, matchHash, keysBroughtBy, signerFrom, uniqueCodes, blockList, validStages, valid, readFindings });
