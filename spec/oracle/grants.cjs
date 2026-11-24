'use strict';
// The oracle's part for authority (authority.md): a grant, its scope, its line and what it binds.
const Basics = require('./basics.cjs');
const Bytes = require('./bytes.cjs');
const Check = require('./check.cjs');
const Circles = require('./circles.cjs');
const Consent = require('./consent.cjs');
const Deals = require('./deals.cjs');
const Identity = require('./identity.cjs');
const Things = require('./things.cjs');
// ================================================================ authority (authority.md)
// the names a block's type answers to in a grant's scope.types (authority.md): its type, and type.kind when its kind is text
const typeNames = b => Basics.isStr(b.state.kind) ? [b.type, b.type + '.' + b.state.kind] : [b.type];
// whether a block's author receives a grant: open (no refs.to), or made to them. A to that is not one id names no one.
function receives(g, b) {
  return receivesAs(g, b.refs.author);
}
function receivesAs(g, who) {
  if (g.refs.to === undefined) return true;
  if (!Basics.isStr(g.refs.to) || g.refs.to === '') return false;
  return g.refs.to === who;
}
// ended(g, pool, count, seen): a grant ends at a counted stop by its grantor (its author, or, for a grant signed as a circle, one who may sign for it), or
// a decline or leaving by its receiver; only for the blocks that see the stop (seen), as a death ends it (authority.md, Ending)
function ended(g, pool, count = b => Identity.counts(b, pool), seen = () => true) {
  return pool.all().some(u => ((u.type === 'grant' && ['stopped', 'declined'].includes(u.state.status)) || Things.isDeclineReading(u)) && count(u) && seen(u.hash) && (
    (u.refs.updates === g.hash && ((u.refs.author === g.refs.author && u.refs.as === undefined && (g.refs.as === undefined || Circles.stillHolds(u, g.refs.as, pool))) || (g.refs.as === undefined && u.refs.author === g.refs.author) || (g.refs.as !== undefined && u.refs.as === g.refs.as && Circles.mayActAsIn(u, g.refs.as, pool)))) ||
    (u.refs.updates === g.hash && Basics.isStr(g.refs.to) && u.refs.author === g.refs.to && g.refs.as !== undefined && u.refs.as === undefined) || // a holder may always end her own place under it
    (u.refs.answers === g.hash && Basics.isStr(g.refs.to) && u.refs.author === g.refs.to)));
}
// A grant is live only while every ancestor grant is live (invariant 9). For a block that relies on it, a death ends it only when the close is in that
// block's causal past.
function grantLive(g, pool, seen = new Set(), relying) {
  if (!g || g.type !== 'grant' || seen.has(g.hash)) return false;
  seen.add(g.hash);
  // a block with a status is a stop or an answer, never a grant (authority.md); a stop or a decline ends it for the blocks that see it (Ending)
  const seenBy = grantSeenBy(g, pool, relying); // a stop is seen by a block that has it in its past, or where the grant names clocks, by the lines
  if (g.state.status !== undefined || !Identity.binds(g, pool) || ended(g, pool, undefined, seenBy)) return false;
  if (endsOnReached(g, pool, seenBy)) return false; // her own ending term, read in causal order as her own stop is
  // a block dated (its own at) at or after the grant's scope.expires acts under no grant: its signer's own date says the grant had run out
  if (relying && Basics.ranOut(g, relying)) return false; // a missing `at` reads the same in every part: under a grant with `expires`, as under any stated end, it is not in time
  // a grant signed as a circle gives the circle's authority only when its signer may sign for it there, with the hands it needs; for a block that
  // relies on it, only the confirms in that block's causal past count (circles.md, Many hands)
  if (g.refs.as !== undefined) {
    // for a block that relies on it, only the hands in that block's causal past count (a move holds at a block, in whose causal past enough hands count)
    if (relying) { if (!Circles.circleHoldsWithin(g, pool, pool.past(relying.hash))) return false; }
    else if (Things.principalOf(g, pool) === null) return false;
  }
  if (g.refs.parent !== undefined) return grantLive(pool.get(g.refs.parent), pool, seen, relying);
  return true;
}
// ================================================================ grants (authority.md)
// What a tool may do for her. One rule says whether a block under a grant speaks for the giver; the rest is its parts: Keeps to, the line a limit is counted on,
// the pass between her tools, the deadline and the lowest offer, the stop, the worst case. Nothing here fills in a silence.
const SET_PLACES = ['pay_by', 'deliver_by']; // protocol.json `set_places`: the term places; a line's price and quantity are read the same way
const DURATION_BASE = '2000-01-01T00:00:00.000Z'; // durations are compared by adding both to one instant (core.md, section 3)
const isRangeV = v => Basics.isObj(v) && Object.keys(v).length > 0 && Object.keys(v).every(k => k === 'min' || k === 'max');
const isListV = v => Basics.isObj(v) && Object.keys(v).length === 1 && 'one_of' in v;
const isRL = v => isRangeV(v) || isListV(v);
// a plain value at a place: { kind, n } (n an exact fraction) or null. Kinds never mix: an amount's unit and `of`, a price's per byte for byte, a time, a duration.
function placeValue(v) {
  if (Basics.isStr(v)) {
    if (Check.timeProblem(v) === null) return { kind: 'time', n: { n: BigInt(Date.parse(v)), d: 1n } };
    if (Check.parseDur(v)) { const t = Check.addDur(DURATION_BASE, v); return t === null ? null : { kind: 'duration', n: { n: BigInt(Date.parse(t)), d: 1n } }; }
    return null;
  }
  if (Basics.isObj(v) && Check.shapeOf(v) === 'amount' && !Check.amountProblem(v)) return { kind: 'amount:' + Bytes.jcs(Deals.kindOf(v)), n: Deals.dec(v.value) };
  if (Basics.isObj(v) && Check.shapeOf(v) === 'price_per' && Check.priceProblems(v).length === 0) return { kind: 'price:' + Bytes.jcs(Deals.kindOf(v.amount)) + '/' + Bytes.jcs(v.per), n: Deals.dec(v.amount.value) };
  return null;
}
// a range { min, max } (one end or both, of one kind, min less than max) or a list { one_of } (two or more values, of one kind, sorted): `shape` or null
function rangeListProblem(v) {
  if (isRangeV(v)) {
    const ends = ['min', 'max'].filter(k => k in v).map(k => placeValue(v[k]));
    if (ends.some(e => e === null) || ends.some(e => e.kind !== ends[0].kind)) return 'shape';
    if (ends.length === 2 && Deals.fcmp(ends[0].n, ends[1].n) >= 0) return 'shape';
    return null;
  }
  if (isListV(v)) {
    const l = v.one_of;
    if (!Array.isArray(l) || l.length < 2) return 'shape';
    const vs = l.map(placeValue);
    if (vs.some(e => e === null) || vs.some(e => e.kind !== vs[0].kind)) return 'shape';
    for (let i = 1; i < vs.length; i++) if (Deals.fcmp(vs[i - 1].n, vs[i].n) >= 0) return 'shape';
    return null;
  }
  return 'shape';
}
// a plain value is inside a range or a list: of the same kind, from min to max (both counted), or equal to a listed number. Where the promise repeats, a duration end is added to the start of the occurrence C names.
function insideRL(a, c, occurrence) {
  const cv = placeValue(c);
  if (cv === null) return false;
  const endOf = e => { const pv = placeValue(e); if (pv && pv.kind === 'duration' && cv.kind === 'time' && occurrence) { const t = Check.addDur(occurrence, e); return t === null ? null : { kind: 'time', n: { n: BigInt(Date.parse(t)), d: 1n } }; } return pv; };
  if (isRangeV(a)) {
    for (const k of ['min', 'max']) {
      if (!(k in a)) continue;
      const e = endOf(a[k]);
      if (!e || e.kind !== cv.kind || (k === 'min' ? Deals.fcmp(cv.n, e.n) < 0 : Deals.fcmp(cv.n, e.n) > 0)) return false;
    }
    return true;
  }
  return Array.isArray(a.one_of) && a.one_of.some(x => { const e = endOf(x); return !!e && e.kind === cv.kind && Deals.fcmp(cv.n, e.n) === 0; });
}
// ---- Keeps to (authority.md, Blocks that bind): a promise C keeps to a promise A when C's state and refs are A's key for key, bar a closed list of eight.
// { keeps, why }: `why` the first sorted path that differs and is not one of the eight. ctx: { principal, parties } (what item 4 and item 7 need).
// a path under `terms` is written `terms.price`, any other state field `state.where`, a ref `refs.what`, a line's term `terms.lines.<id>.price` (the text's own two spellings).
// `state.draws` is a field a tool's block carries of its own (item 1), and `state.audience` is left out of the comparison (item 2: a sealed list cannot be checked here).
function keepsTo(C, A, pool, ctx, depth) {
  ctx = ctx || {}; depth = depth || 0;
  const diffs = new Set(), d = p => diffs.add(p), same = (x, y) => (x === undefined || y === undefined ? x === y : Bytes.jcs(x) === Bytes.jcs(y));
  const ownR = ['author', 'prev', 'after', 'key', 'answers', 'under', 'as']; // `as` is the block's own, like `author`: a circle's want can be kept to by the other side, and a tool can buy for a circle
  const isKindId = h => { const t = pool.get(h); return !!t && (pool.all().some(x => x.refs && x.refs.of === h) || t.state.kind === 'kind'); };
  const whatKeeps = (a, c) => {
    if (a === undefined || c === undefined) return false;
    const as = Check.asList(a), cs = Check.asList(c);
    if (as.length && as.every(isKindId)) return cs.length > 0 && cs.every(h => { const t = pool.get(h); return !!t && as.includes(t.refs.of); }) && as.every(k => cs.some(h => { const t = pool.get(h); return !!t && t.refs.of === k; }));
    return same([...as].sort(), [...cs].sort());
  };
  const occ = Basics.isStr(C.state.occurrence) && Check.timeProblem(C.state.occurrence) === null ? C.state.occurrence : null;
  const aT = Basics.isObj(A.state.terms) ? A.state.terms : {}, cT = Basics.isObj(C.state.terms) ? C.state.terms : {};
  const placeKeeps = (k, a, c, p) => {
    if (c === undefined) { if (a !== undefined) d(p); return; }
    if (isRL(c)) { d(p); return; }
    if (a === undefined) {
      // item 7: a price, where A states none, she pays it, and the other side signs C
      if (k === 'price' && ctx.principal && C.refs.to === ctx.principal && C.hash !== undefined && Things.speakerOf(C, pool) !== ctx.principal) return;
      d(p); return;
    }
    if (isRL(a)) { if (!insideRL(a, c, occ)) d(p); return; }
    if (!same(a, c)) d(p);
  };
  for (const k of new Set([...Object.keys(A.refs), ...Object.keys(C.refs)])) {
    if (ownR.includes(k)) continue;
    const a = A.refs[k], c = C.refs[k];
    if (k === 'for') { for (const h of Check.asList(c)) { if (h === A.hash) continue; const x = pool.get(h); if (!(x && x.type === 'promise' && depth < 8 && keepsTo(x, A, pool, ctx, depth + 1).keeps)) d('refs.for'); } continue; }
    if (k === 'from' || k === 'to') {
      if (a === undefined) { if (c === undefined) d('refs.' + k); else if (Check.asList(ctx.parties).length && c !== ctx.principal && !ctx.parties.includes(c)) d('refs.' + k); }
      else if (!same(a, c)) d('refs.' + k);
      continue;
    }
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
      const al = Check.asList(aT.lines), cl = Check.asList(cT.lines);
      for (const id of new Set([...al, ...cl].map(l => (Basics.isObj(l) ? l.id : undefined)))) {
        const x = al.find(l => Basics.isObj(l) && l.id === id), y = cl.find(l => Basics.isObj(l) && l.id === id);
        if (!x || !y) { d('terms.lines.' + id); continue; }
        // item 6 at a line's price and quantity (item 7 where A's line states no price); item 5 at its what: where A's line names a kind, C's names an instance of it
        for (const f of new Set([...Object.keys(x), ...Object.keys(y)])) { if (f === 'price' || f === 'quantity') placeKeeps(f, x[f], y[f], 'terms.lines.' + id + '.' + f); else if (f === 'what') { if (!whatKeeps(x[f], y[f])) d('terms.lines.' + id + '.what'); } else if (!same(x[f], y[f])) d('terms.lines.' + id + '.' + f); }
      }
      continue;
    }
    if (SET_PLACES.includes(k)) { placeKeeps(k, aT[k], cT[k], 'terms.' + k); continue; }
    if (!same(aT[k], cT[k])) d('terms.' + k);
  }
  const first = [...diffs].sort()[0];
  return { keeps: diffs.size === 0, why: first === undefined ? null : first };
}

// ---- the grant, its chain and what a block under it is
const scopeOf = g => (Basics.isObj(g.state.scope) ? g.state.scope : {});
const limitOf = g => { const l = scopeOf(g).limit; return Deals.isAmount(l) ? l : null; };
const eachOf = g => { const l = scopeOf(g).each; return Deals.isAmount(l) ? l : null; };
function grantChain(g, pool) { const out = [g]; for (let x = g, i = 0; i < 64; i++) { const up = x.refs.parent === undefined ? null : pool.get(x.refs.parent); if (!up || up.type !== 'grant') break; out.push(up); x = up; } return out; }
// the kind of a block under a grant, (authority.md, Blocks that bind): a promise (offer, want, counter), an accept (an accepted answer: her yes, an allocation), a payment or a delivery, a word about what is hers to receive, a make
function blockKind(b) {
  if (b.type === 'promise') return b.state.status === undefined ? 'promise' : b.state.status === 'accepted' ? 'accept' : 'other';
  if (b.type === 'transfer') return b.state.status === undefined ? 'pay' : b.state.status === 'accepted' ? 'word' : 'other';
  if (b.type === 'observe') return ['received', 'covers', 'paid'].includes(b.state.kind) ? 'word' : 'other';
  if (b.type === 'transform') return 'make';
  return 'other';
}
// the promise an accept binds her to: followed through accepts (an allocation answers an accept) to the offer or counter it ends at; a promise with no status is itself; else null
function promiseOf(b, pool) {
  let x = b;
  for (let i = 0; i < 16; i++) {
    if (x.type !== 'promise') return null;
    if (x.state.status === undefined) return x;
    if (x.state.status !== 'accepted') return null;
    const t = pool.get(Check.asList(x.refs.answers)[0]);
    if (!t) return null;
    x = t;
  }
  return null;
}
// the first promise of a deal: a promise that answers nothing is it; a counter names it in refs.for
const firstPromiseOf = (p, pool) => { if (!p) return null; if (p.refs.answers === undefined) return p; const f = pool.get(Check.asList(p.refs.for)[0]); return f && f.type === 'promise' ? f : p; };
// the deal a word, a payment or a delivery is `for`: its refs.for, its subject, or the deal the block it answers is for
function dealFor(b, pool) {
  const ids = [...Check.asList(b.refs.for), ...Check.asList(b.refs.subject)];
  for (const h of Check.asList(b.refs.answers)) { const t = pool.get(h); if (t) ids.push(...Check.asList(t.refs.for), ...Check.asList(t.refs.subject)); }
  for (const h of ids) { const p = pool.get(h); if (p && p.type === 'promise') return firstPromiseOf(promiseOf(p, pool) || p, pool); }
  return null;
}
// the deal a block is a draw on, (counted once): the deal's first promise
function dealKeyOf(b, pool) {
  const k = blockKind(b);
  if (k === 'promise') { const r = firstPromiseOf(b, pool); return r ? r.hash : b.hash; }
  if (k === 'accept') { const p = promiseOf(b, pool); const r = p && firstPromiseOf(p, pool); return r ? r.hash : null; }
  const d = dealFor(b, pool); return d ? d.hash : null;
}
// two keys joined by a two-key link (identity.md, A two-key link): one writes an observe of kind `link` with `same_as` the other, and the other counter-signs with its own `link` naming the first in refs.confirms
function keysLinked(x, y, pool) {
  const links = pool.all().filter(o => o.type === 'observe' && o.state.kind === 'link' && Basics.isStr(o.refs.author) && Identity.counts(o, pool));
  return links.some(l1 => Check.asList(l1.refs.same_as).length && [[x, y], [y, x]].some(([a, b]) => l1.refs.author === a && Check.asList(l1.refs.same_as).includes(b) &&
    links.some(l2 => l2.refs.author === b && Check.asList(l2.refs.same_as).includes(a) && Check.asList(l2.refs.confirms).includes(l1.hash))));
}
// the promises of scope.on this grant holds: a grant that names A in `on` is a draw on A's quantity from her line; a second grant naming A takes only what the first left (authority.md, Her quantity is the measure)
function onRows(g, pool) {
  pool._s4o = pool._s4o || new Map();
  if (pool._s4o.has(g.hash)) return pool._s4o.get(g.hash);
  pool._s4o.set(g.hash, []); // a ring reads as holding nothing
  const rows = [];
  for (const h of Check.asList(scopeOf(g).on)) {
    const A = pool.get(h);
    if (!A || A.type !== 'promise') { rows.push({ promise: h, takes: false, why: 'not_owner' }); continue; }
    const hasQty = Check.linesOf(A.state.terms).some(l => Deals.isAmount(topOf(l.quantity)));
    if (!hasQty || g.refs.parent !== undefined) { rows.push({ promise: h, takes: true, why: null }); continue; }
    const rivals = pool.all().filter(x => x.type === 'grant' && x.hash !== g.hash && x.state.status === undefined && x.refs.parent === undefined && x.refs.author === g.refs.author && Check.asList(scopeOf(x).on).includes(h));
    const stopped = x => pool.all().some(s => s.type === 'grant' && s.state.status === 'stopped' && s.refs.updates === x.hash && s.refs.author === x.refs.author && Identity.counts(s, pool) && pool.sees(g.hash, s.hash));
    let takes = true;
    for (const x of rivals) {
      if (stopped(x)) continue;
      if (pool.sees(g.hash, x.hash)) { if (onRows(x, pool).some(r => r.promise === h && r.takes)) takes = false; }
      else if (!pool.sees(x.hash, g.hash)) takes = false; // neither came first: neither takes (
    }
    rows.push({ promise: h, takes, why: takes ? null : 'past' });
  }
  pool._s4o.set(g.hash, rows);
  return rows;
}
const heldPromises = (g, pool) => onRows(g, pool).filter(r => r.takes).map(r => r.promise);

// ---- the line a limit is counted on (authority.md, A limit is counted along one chain)
// { name, author, key, after, own } for the line refs.meter names, { name, missing } when the block is not given, null when the grant names none
function meterLine(g, pool) {
  const mh = g.refs.meter;
  if (!Basics.isStr(mh)) return null;
  const m = pool.get(mh);
  if (!m) return { name: mh, missing: true };
  let spec = null;
  if (m.type === 'actor' && m.refs.author === undefined) spec = { author: m.hash, key: Basics.isStr(m.state.public_key_sign) ? m.state.public_key_sign : null, after: 0 };
  else if (Check.isKeyGrant(m) && !Array.isArray(m.state.voices) && Basics.isStr(m.state.public_key_sign) && Basics.isStr(m.refs.subject)) spec = { author: m.refs.subject, key: m.state.public_key_sign, after: 0 };
  else if (Basics.isStr(m.refs.author)) spec = { author: m.refs.author, key: Identity.signerKeyOf(m, pool), after: Number.isInteger(m.state.seq) ? m.state.seq : 0 };
  if (!spec) return { name: mh, missing: true };
  return { ...spec, name: mh, own: spec.author === g.refs.to };
}
const onMeterLine = (L, o, pool) => Basics.isObj(o.refs) && o.refs.author === L.author && o.hash !== L.name && Number.isInteger(o.state.seq) && o.state.seq > L.after && (L.key === null || Identity.signerKeyOf(o, pool) === L.key);
// a line in `prev` order (a fold reads a line in `prev` order; `seq` numbers it and never orders it)
function lineBlocksOf(L, pool) {
  const li = Identity.lineInfoOf(pool);
  return pool.all().filter(o => onMeterLine(L, o, pool)).sort((x, y) => li.of(x).depth - li.of(y).depth || pool.past(x.hash).size - pool.past(y.hash).size || Basics.cmp(x.hash, y.hash));
}
const cmpDurations = (d, e) => { const a = Check.addDur(DURATION_BASE, d), b = Check.addDur(DURATION_BASE, e); return a !== null && b !== null ? (a < b ? -1 : a > b ? 1 : 0) : NaN; };
// a draw's period under `every`: the periods turn at the cutoffs of the meter's line that run for at least `every` (a cutoff of the grant's line is an observe of kind cutoff, refs.subject the grant, `when` a span)
function periodOf(g, L, atBlock, pool) {
  if (!Basics.isStr(scopeOf(g).every) || !L || L.missing) return null;
  const cuts = pool.all().filter(c => c.type === 'observe' && c.state.kind === 'cutoff' && Check.asList(c.refs.subject).includes(g.hash) && Basics.isStr(c.state.when) && Check.parseDur(c.state.when) && cmpDurations(c.state.when, scopeOf(g).every) >= 0 && onMeterLine(L, c, pool));
  // before a block: in its causal past on the holder's own line; before its first receipt on another key's line
  const at = L.own ? atBlock : meterReceipts(L, pool).find(r => Check.asList(r.refs.derives_from).includes(atBlock.hash));
  return at ? cuts.filter(c => pool.sees(at.hash, c.hash)).length : 0;
}
// ---- the line a limit is counted on (authority.md, A limit is counted along one chain): its measures, its draws in line order, what is left
const isAcceptOfPromise = (b, pool) => b.state.status === 'accepted' && (b.type === 'promise' || b.type === 'observe') && (() => { const o = pool.get(Check.asList(b.refs.answers)[0]); return !!o && o.type === 'promise'; })();
const topOf = v => (isRL(v) ? Consent.rangeEnds(v).hi : v);
// the measure a line of a promise in `on` is: the promise's id and the line's
const lineMeasure = (A, l) => A.hash + '#' + (Basics.isStr(l.id) ? l.id : '');
// the measures of a grant's line: its `limit`; each promise of `on` (her quantity: all of it where the grant's draw on it took, else none); each instance in refs.what (the limit where it is of the instance's kind, else its pack)
function measuresOf(g, pool) {
  const out = [], limit = limitOf(g), rows = onRows(g, pool);
  if (scopeOf(g).limit !== undefined) out.push({ of: g.hash, amount: limit });
  for (const h of Check.asList(scopeOf(g).on)) {
    const A = pool.get(h);
    if (!A || A.type !== 'promise') continue;
    // each line of it is a measure she owns: `<promise>#<line>`
    const r = rows.find(x => x.promise === h);
    for (const l of Check.linesOf(A.state.terms)) {
      const q = topOf(l.quantity);
      if (!Deals.isAmount(q)) continue;
      out.push({ of: lineMeasure(A, l), amount: r && !r.takes ? { ...q, value: '0' } : q });
    }
  }
  for (const w of Check.asList(g.refs.what)) { const t = pool.get(w), pack = t && Deals.isAmount(t.state.pack) ? t.state.pack : null; out.push({ of: w, amount: limit && pack && Deals.sameKind(limit, pack) ? limit : pack }); }
  return out;
}
// the promise of `on` that C keeps to: C keeps to it (Keeps to), or C is itself an accept of it (an order of an open offer: it names only the quantity it chooses, inside A's)
function keptBy(C, ons, pool) {
  for (const A of ons) {
    if (isAcceptOfPromise(C, pool) && C.refs.answers === A.hash) {
      // each line it chooses for is a line of A, its quantity inside A's range or no more than A's one value
      const al = Check.linesOf(A.state.terms);
      const keeps = (Basics.isObj(C.state.terms) && Array.isArray(C.state.terms.lines) ? C.state.terms.lines : []).every(x => {
        const l = Basics.isObj(x) ? al.find(y => y.id !== undefined && y.id === x.id) : undefined, q = Basics.isObj(x) ? x.quantity : undefined, aq = l ? l.quantity : undefined;
        return !!l && (q === undefined || aq === undefined || (isRL(aq) ? insideRL(aq, q) : (placeValue(q) && placeValue(aq) && placeValue(q).kind === placeValue(aq).kind && Deals.fcmp(placeValue(q).n, placeValue(aq).n) <= 0)));
      });
      if (keeps) return A;
      continue;
    }
    if (keepsTo(C, A, pool, {}).keeps) return A;
  }
  return null;
}
// the accepts under the grant, and the deals each made (its `for`, and the offer it answers)
const dealsMadeUnder = (g, pool) => pool.all().filter(b => b.refs.under === g.hash && isAcceptOfPromise(b, pool) && Identity.binds(b, pool)).map(b => [b, [...Check.asList(b.refs.for), ...Check.asList(b.refs.answers)]]);
// the receipts of another key's line, in line order
const meterReceipts = (L, pool) => lineBlocksOf(L, pool).filter(o => o.type === 'observe' && o.state.kind === 'receipt');
// what a deal it bound comes to for her, in `kind` (authority.md, A draw): the quantities its lines bind where she sells or the limit is of
// their kind; else the total at the lines chosen, with the backing she gives (a price fixed later is counted at its `max`); null where it
// cannot be worked out
function bindsOnTerms(onTerms, cLines, chosen, sells, kind) {
  const qs = cLines.map(l => Check.quantityOf(l, chosen)).filter(Deals.isAmount);
  const goodsKind = kind || (qs.length ? Deals.kindOf(qs[0]) : null);
  const inKind = qs.filter(q => goodsKind && Deals.sameKind(q, goodsKind));
  if (sells || (kind && inKind.length)) return inKind.length ? { f: inKind.reduce((t, q) => Deals.fadd(t, Deals.dec(q.value)), { n: 0n, d: 1n }), kind: goodsKind } : null;
  const t = Basics.isObj(onTerms.state.terms) ? onTerms.state.terms : {};
  // a line priced by a figure is counted at its max, per its `per` (else per one of its quantity's unit)
  const atMax = { ...t, lines: Check.linesOf(t).map(l => {
    if (!(Basics.isObj(l.price) && 'figure' in l.price)) return l;
    const q = Check.quantityOf(l, chosen);
    return Deals.isAmount(l.price.max) && Deals.isAmount(q) ? { ...l, price: { amount: l.price.max, per: l.price.per || { value: '1', unit: q.unit } } } : { ...l, price: { figure: true } };
  }) };
  const tot = Deals.termsTotalF(atMax, chosen);
  if (!tot) return null;
  if (Deals.isAmount(t.backing) && Deals.sameKind(t.backing, tot.kind)) tot = { f: Deals.fadd(tot.f, Deals.dec(t.backing.value)), kind: tot.kind };
  return tot;
}
// each block counted on the line, with what it takes of each measure (in line order); `filter` false where the line is read from inside the clauses of a tool's word
function drawsOnLine(g, L, pool, filter) {
  const gh = g.hash, limit = limitOf(g), each = eachOf(g), what = Check.asList(g.refs.what), principal = Things.principalOfChain(g, pool);
  const ons = Check.asList(scopeOf(g).on).map(h => pool.get(h)).filter(A => A && A.type === 'promise');
  const kind = limit ? Deals.kindOf(limit) : each ? Deals.kindOf(each) : null;
  const blocks = pool.all().filter(b => {
    const underIt = b.refs.under === gh && (b.state.status === undefined || isAcceptOfPromise(b, pool));
    const passed = b.type === 'grant' && b.refs.parent === gh && b.state.status === undefined;
    return b.type !== undefined && (underIt || passed) && Identity.binds(b, pool) && (passed || !filter || clauseProblem(b, g, pool) === null);
  });
  const recs = L.own ? [] : meterReceipts(L, pool), waiting = [], placed = [];
  for (const b of blocks) {
    if (L.own) { if (!onMeterLine(L, b, pool)) placed.push({ place: Infinity, b, fixed: 'not_on_chain' }); else placed.push({ place: Number.isInteger(b.state.seq) ? b.state.seq : 0, b, fixed: null }); continue; }
    const i = recs.findIndex(r => Check.asList(r.refs.derives_from).includes(b.hash));
    if (i >= 0) placed.push({ place: i, b, fixed: null }); else { waiting.push({ block: b.hash, on: 'meter' }); placed.push({ place: Infinity, b, fixed: 'waiting' }); }
  }
  placed.sort((x, y) => (x.place === y.place ? Basics.cmp(x.b.hash, y.b.hash) : x.place < y.place ? -1 : 1));
  const out = [];
  for (const { place, b, fixed: f0 } of placed) {
    const takes = []; let fixed = f0;
    if (b.type === 'grant') { if (Deals.isAmount(scopeOf(b).limit)) takes.push([gh, scopeOf(b).limit]); }
    else if (isAcceptOfPromise(b, pool) || (b.type === 'promise' && b.state.status === undefined)) {
      const C = isAcceptOfPromise(b, pool) ? pool.get(b.refs.answers) : b;
      if (C) {
        // the lines it binds: an accept's choice of the promise it answers, else the promise's own
        const chosen = isAcceptOfPromise(b, pool) && Basics.isObj(b.state.terms) ? b.state.terms.lines : undefined;
        const cLines = Check.linesOf(C.state.terms);
        const A = keptBy(C, ons, pool);
        if (A) for (const l of cLines) { const q = Check.quantityOf(l, chosen); if (Deals.isAmount(q)) takes.push([Basics.isStr(C.state.occurrence) && Basics.isObj(A.state.terms) && A.state.terms.repeat !== undefined ? lineMeasure(A, l) + '@' + C.state.occurrence : lineMeasure(A, l), q]); }
        const sells = !!principal && ((A && A.refs.from === principal) || C.refs.from === principal);
        const onTerms = isAcceptOfPromise(C, pool) ? pool.get(C.refs.answers) || C : C;
        const binds = bindsOnTerms(onTerms, cLines, chosen, sells, kind);
        if (limit || each) {
          const dr = b.state.draws, stated = Basics.isObj(dr) && dr.grant === gh && Deals.isAmount(dr.amount) ? dr.amount : null;
          if (stated && binds && Deals.sameKind(stated, kind) && Deals.sameKind(binds.kind, stated) && Deals.fcmp(binds.f, Deals.dec(stated.value)) <= 0) takes.push([gh, stated]); else fixed = fixed || 'unit';
        } else if ((binds === null || Deals.fpos(binds.f)) && !sells) fixed = fixed || 'past';
      }
    } else if (b.type === 'transfer') {
      const to = Check.asList(b.refs.to_owner);
      if (!(to.length === 1 && to[0] === principal)) {
        const a = Deals.isAmount(b.state.amount) ? b.state.amount : null, part = Check.asList(b.refs.what).filter(w => what.includes(w));
        if (part.length && a) takes.push([part[0], a]);
        else if (a) {
          const counted = dealsMadeUnder(g, pool).some(([x, ds]) => Check.asList(b.refs.for).some(d => ds.includes(d)) && pool.sees(b.hash, x.hash));
          if (!counted) { if (limit || each) takes.push([gh, a]); else if (Deals.fpos(Deals.dec(a.value))) fixed = fixed || 'past'; }
        }
      }
    } else if (b.type === 'transform') {
      for (const i of Check.asList(b.state.inputs)) {
        if (!Basics.isObj(i) || !Basics.isStr(i.from) || !Deals.isAmount(i.amount) || !what.includes(i.from)) continue;
        takes.push([i.from, i.amount]);
        if (limit && Deals.sameKind(limit, i.amount)) takes.push([gh, i.amount]);
      }
    }
    const mine = takes.find(([o]) => o === gh);
    if (each && mine && (!Deals.sameKind(mine[1], each) || Deals.fcmp(Deals.dec(mine[1].value), Deals.dec(each.value)) > 0)) fixed = fixed || 'past';
    if (fixed === 'waiting' && !takes.length) { fixed = null; const k = waiting.findIndex(x => x.block === b.hash); if (k >= 0) waiting.splice(k, 1); }
    out.push({ block: b.hash, takes, fixed, period: periodOf(g, L, b, pool) || 0, place });
  }
  return { draws: out, waiting };
}
// a pair on the holder's own line at or before a block: its blocks, sorted, or null
function pairAt(b, L, pool) {
  const past = pool.past(b.hash);
  for (const grp of pairGroups(pool)) {
    if (!grp.every(x => { const o = pool.get(x); return !!o && (onMeterLine(L, o, pool) || o.refs.author === L.author); })) continue;
    if (grp.some(x => x === b.hash || past.has(x))) return [...grp].sort();
  }
  return null;
}
// the groups of a pair: one key's blocks on one prev, or at one seq
function pairGroups(pool) {
  const pairs = Identity.forkPairs(pool), adj = new Map();
  for (const [x, y] of pairs) { for (const [a, c] of [[x, y], [y, x]]) { if (!adj.has(a)) adj.set(a, new Set()); adj.get(a).add(c); } }
  const seen = new Set(), out = [];
  for (const h of adj.keys()) { if (seen.has(h)) continue; const grp = [], st = [h]; while (st.length) { const z = st.pop(); if (seen.has(z)) continue; seen.add(z); grp.push(z); for (const y of adj.get(z)) st.push(y); } out.push(grp.sort()); }
  return out;
}
const forkAnswer = (g, pool, group) => ({ pair: true, blocks: group, at_most: Consent.worstOp(g, pool.all()).at_most });
// the meter: { grant, fits, why, line, start, period, draws, left, waiting, ended, comes_back } for one block under the grant (or a grant passed on from it), or for the grant's own draws when `at` is null; { not_shown, lacks } where the line is not given
function meterRead(g, pool, at) {
  const key = 'm4:' + g.hash + ':' + (at ? at.hash : '');
  pool._s4mr = pool._s4mr || new Map();
  if (pool._s4mr.has(key)) return pool._s4mr.get(key);
  pool._s4in = pool._s4in || new Set();
  const fresh = !pool._s4in.has(g.hash);
  pool._s4in.add(g.hash);
  let r;
  try { r = meterNow(g, pool, at, fresh); } finally { if (fresh) pool._s4in.delete(g.hash); }
  if (fresh) pool._s4mr.set(key, r);
  return r;
}
function meterNow(g, pool, at, filter) {
  const gh = g.hash, measures = measuresOf(g, pool);
  const ownWhy = onRows(g, pool).some(r => r.why === 'past' && !r.takes) ? 'past' : null;
  const empty = (fits, why) => ({ grant: gh, fits, why, line: null, start: null, period: 0, draws: [], left: [], waiting: [], ended: null, comes_back: [] });
  const L = meterLine(g, pool);
  if (L === null) {
    if (!at) return empty(ownWhy === null, ownWhy);
    const bound = g.refs.what !== undefined || scopeOf(g).on !== undefined || scopeOf(g).limit !== undefined;
    return bound ? empty(false, 'not_on_chain') : empty(true, null);
  }
  if (L.missing) return { not_shown: true, lacks: [L.name] };
  const { draws, waiting } = drawsOnLine(g, L, pool, filter);
  if (L.own && at) { const grp = pairAt(at, L, pool); if (grp) return { grant: gh, fits: false, why: forkAnswer(g, pool, grp), line: 'own', start: L.name, period: 0, draws: [], left: [], waiting, ended: null, comes_back: [] }; }
  const stops = pool.all().filter(s => s.type === 'grant' && s.state.status === 'stopped' && s.refs.updates === gh && s.refs.author === g.refs.author && Identity.counts(s, pool)).sort((x, y) => Basics.cmp(x.hash, y.hash));
  const recs = L.own ? [] : meterReceipts(L, pool);
  let ended = null, endedPlace = null;
  if (L.own) ended = stops.length ? stops[0].hash : null;
  else { const s = stops.find(s => recs.some(r => Check.asList(r.refs.derives_from).includes(s.hash))); ended = s ? s.hash : null; if (ended) endedPlace = recs.findIndex(r => Check.asList(r.refs.derives_from).includes(ended)); }
  const receiptOf = h => recs.find(r => Check.asList(r.refs.derives_from).includes(h)) || null;
  const statedTotal = (r, of) => { const it = Array.isArray(r.state.drawn) ? r.state.drawn.find(i => Basics.isObj(i) && i.of === of) : null; return it && Deals.isAmount(it.total) ? it.total : null; };
  let meterFork = null;
  if (!L.own) {
    for (const grp of pairGroups(pool)) {
      if (!grp.every(x => { const o = pool.get(x); return !!o && onMeterLine(L, o, pool); })) continue;
      const places = grp.map(x => { const i = recs.findIndex(r => r.hash === x); if (i >= 0) return i; const j = recs.findIndex(r => pool.sees(r.hash, x)); return j >= 0 ? j : Infinity; });
      const p = Math.min(...places);
      if (p !== Infinity && (!meterFork || p < meterFork.place)) meterFork = { place: p, answer: forkAnswer(g, pool, [...grp].sort()) };
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
    const givenBack = (of, p) => Deals.fsumF(frees.filter(f => f.of === of && f.period === p && past.has(f.by)).map(f => f.amount));
    const r = receiptOf(d.block);
    const whole = !r || (() => { const w = Identity.walkLine(pool, r.hash, L.name); return w.reached && w.lacks.length === 0; })();
    if (why === null) {
      for (const [of, a] of d.takes) {
        const p = periodFor(of, d), m = cap(of);
        if (!m) { why = 'no_measure'; break; }
        if (!Deals.sameKind(m, a)) { why = 'unit'; break; }
        const t = r && !whole ? statedTotal(r, of) : null;
        const over = t ? (!Deals.sameKind(t, m) || Deals.fcmp(Deals.dec(t.value), Deals.dec(m.value)) > 0) : Deals.fcmp(Deals.fadd(Deals.fsub(running.get(k2(of, p)) || Deals.F0, givenBack(of, p)), Deals.dec(a.value)), Deals.dec(m.value)) > 0;
        if (over) { why = 'past'; break; }
      }
    }
    if (why === null) {
      for (const [of, a] of d.takes) { const k = k2(of, periodFor(of, d)); running.set(k, Deals.fadd(running.get(k) || Deals.F0, Deals.dec(a.value))); }
      const b = pool.get(d.block);
      for (const f of restFreed(b, g, d.takes, pool)) frees.push({ ...f, period: periodFor(f.of, d) });
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
    let used = Deals.F0; for (const [k, v] of running) { const i = k.lastIndexOf('#'); if (Number(k.slice(i + 1)) === per && mine(k.slice(0, i))) used = Deals.fadd(used, v); }
    const back = Deals.fsumF(frees.filter(f => f.period === per && mine(f.of) && (!seen || seen.has(f.by))).map(f => f.amount));
    return { f: Deals.fadd(Deals.fsub(Deals.dec(m.amount.value), used), back), kind: Deals.kindOf(m.amount) };
  };
  const left = measures.map(m => { const l = leftOf(m); return l ? { of: m.of, amount: Deals.amtOut(l.f, l.kind) } : null; }).filter(Boolean);
  const comesBack = ended === null ? [] : measures.map(m => { const l = leftOf(m); return l && Deals.fpos(l.f) ? { of: m.of, amount: Deals.amtOut(l.f, l.kind) } : null; }).filter(Boolean);
  let fits, why, period;
  if (!at) { fits = ownWhy === null; why = ownWhy; period = 0; }
  else if (answer) ({ fits, why, period } = answer);
  else { fits = true; why = null; period = 0; }
  return { grant: gh, fits, why: fits ? null : why, line: L.own ? 'own' : L.name, start: L.name, period, draws: rows, left, waiting, ended, comes_back: comesBack };
}
// the rest of a deal a draw under the grant bound, where it can no longer fall due (folds.md, Freed): the payee's signal that the price is paid; her stop of the grant, where the offer
// said ahead that a stop ends what has not come (`terms.stoppable`); a cutoff through the offer's `deliver_by` on `needed` lines of the clocks it names; a ruling of a judge both sides named that ends the rest (`state.ends_rest`).
// Each measure the draw took on gets back what of it the rest held: the quantity not come, or, in money, the total at that quantity. [{ of, amount (a fraction), by (the freeing block) }]
function restFreed(b, g, takes, pool) {
  if (!b || !isAcceptOfPromise(b, pool)) return [];
  const D = pool.get(b.refs.answers);
  if (!D) return [];
  const t = Basics.isObj(D.state.terms) ? D.state.terms : {}, payee = Basics.isStr(D.refs.from) ? D.refs.from : D.refs.author;
  const chosen = Basics.isObj(b.state.terms) ? b.state.terms.lines : undefined;
  const paid = () => { const x = pool.all().find(x => x.type === 'observe' && x.state.kind === 'paid' && Check.asList(x.refs.subject).includes(D.hash) && Identity.counts(x, pool) && Things.speakerOf(x, pool) === payee); return x ? x.hash : null; };
  const stopped = () => { if (t.stoppable !== true) return null; const s = pool.all().filter(s => s.type === 'grant' && s.state.status === 'stopped' && s.refs.updates === g.hash && s.refs.author === g.refs.author && Identity.counts(s, pool)).sort((x, y) => Basics.cmp(x.hash, y.hash))[0]; return s ? s.hash : null; };
  const delivered = () => {
    const ks = Identity.clocksOf(t.clocks);
    if (!Basics.isStr(t.deliver_by) || !ks) return null;
    const cuts = ks.names.map(n => Bytes.cutoffsOn(n, pool).filter(c => c.state.when === t.deliver_by && Check.asList(c.refs.subject).includes(D.hash)).sort((x, y) => Basics.cmp(x.hash, y.hash))[0]).filter(Boolean);
    return cuts.length && cuts.length >= ks.needed ? cuts[0].hash : null;
  };
  const ruled = () => {
    const sides = [payee, D.refs.to].filter(Basics.isStr), sideOf = x => { const s = Things.speakerOf(x, pool); return sides.includes(s) ? s : null; };
    const judges = pool.all().filter(x => Deals.namesJudge(x, D.hash) && Identity.counts(x, pool) && sideOf(x) !== null
      && pool.all().some(a => a.type === 'observe' && a.state.status === 'accepted' && Check.asList(a.refs.answers).includes(x.hash) && Identity.counts(a, pool) && sideOf(a) !== null && sideOf(a) !== sideOf(x))).map(x => x.state.judge);
    const x = pool.all().find(x => x.type === 'observe' && x.state.kind === 'ruling' && x.refs.subject === D.hash && x.state.ends_rest === true && Identity.counts(x, pool) && judges.includes(x.refs.author));
    return x ? x.hash : null;
  };
  const by = paid() || stopped() || delivered() || ruled();
  if (!by) return [];
  // what has not come of each line: its quantity chosen less the goods handed over `for` the deal toward it, in its kind
  const rests = Check.linesOf(t).map(l => {
    const qv = Check.quantityOf(l, chosen);
    if (!Deals.isAmount(qv)) return null;
    const came = Deals.fsumF(pool.all().filter(x => x.type === 'transfer' && x.state.status === undefined && Check.asList(x.refs.for).includes(D.hash) && Identity.counts(x, pool) && (x.state.line === undefined || x.state.line === l.id) && Deals.isAmount(x.state.amount) && Deals.sameKind(x.state.amount, qv)).map(x => Deals.dec(x.state.amount.value)));
    const rest = Deals.fsub(Deals.dec(qv.value), came);
    return { id: l.id, kind: Deals.kindOf(qv), rest: Deals.fpos(rest) ? rest : Deals.F0 };
  }).filter(Boolean);
  if (!rests.some(r => Deals.fpos(r.rest))) return [];
  // in money: the deal's total at what has not come of each line
  const money = Deals.termsTotalF(t, rests.map(r => ({ id: r.id, quantity: Deals.amtOut(r.rest, r.kind) })));
  return takes.map(([of, a]) => {
    const base = of.split('@')[0], at = base.lastIndexOf('#');
    let back;
    if (at >= 0) { const r = rests.find(x => x.id === base.slice(at + 1) && Deals.sameKind(x.kind, a)); back = r ? r.rest : null; }
    else if (rests.some(r => Deals.sameKind(r.kind, a))) back = Deals.fsumF(rests.filter(r => Deals.sameKind(r.kind, a)).map(r => r.rest));
    else back = money && Deals.sameKind(money.kind, a) ? money.f : null;
    if (back === null) return null;
    back = Deals.fmin(back, Deals.dec(a.value));
    return Deals.fpos(back) ? { of, amount: back, by } : null;
  }).filter(Boolean);
}

// ---- her deadline, and the lowest offer at it. Read on the line refs.meter names.
// where a block stands against a stated time `t` on a line (blocks.md, A cutoff): 'before' (a receipt of it, or the block itself on the line, with no cutoff of `t` for `subject` before it), 'after' (such a cutoff and no such receipt), null (not shown yet)
function standsAgainstTime(L, h, t, subject, pool) {
  const cuts = Bytes.cutoffsOn(L.name, pool).filter(c => c.state.when === t && Check.asList(c.refs.subject).includes(subject));
  const cut = cuts.find(c => !cuts.some(o => o !== c && Bytes.placedBefore(pool, o, c))) || null;
  const rx = Bytes.receiptsOn(L.name, h, pool).slice(), b = pool.get(h);
  if (b && onMeterLine(L, b, pool)) rx.push(b);
  if (rx.some(r => !cut || Bytes.placedBefore(pool, r, cut))) return 'before';
  return cut ? 'after' : null;
}
function lowestOffer(g, pool) {
  const sc = scopeOf(g), none = why => ({ offer: null, received: null, cutoff: null, why });
  if (!Basics.isStr(sc.deadline)) return none('pending');
  const L = meterLine(g, pool);
  if (!L || L.missing) return none('pending');
  const cuts = Bytes.cutoffsOn(L.name, pool).filter(c => c.state.when === sc.deadline && Check.asList(c.refs.subject).includes(g.hash));
  const cut = cuts.find(c => !cuts.some(o => o !== c && Bytes.placedBefore(pool, o, c)));
  if (!cut) return none('pending');
  const ons = Check.asList(sc.on).map(h => pool.get(h)).filter(A => A && A.type === 'promise'), parties = Check.asList(sc.parties), lim = limitOf(g);
  const recs = meterReceipts(L, pool);
  let best = null;
  recs.forEach((r, i) => {
    if (!pool.sees(cut.hash, r.hash)) return;
    for (const h of Check.asList(r.refs.derives_from)) {
      const o = pool.get(h);
      if (!o || o.type !== 'promise' || o.state.status !== undefined) continue;
      const A = ons.find(a => keepsTo(o, a, pool, {}).keeps);
      if (!A) continue;
      const principal = A.refs.author, sidesA = ['from', 'to'].flatMap(k => Check.asList(A.refs[k]));
      if (!['from', 'to'].flatMap(k => Check.asList(o.refs[k])).every(s => s === principal || parties.includes(s) || sidesA.includes(s))) continue;
      // standing there: no cutoff through its own `expires` before the deadline's on that line, and no stop of it in the cutoff's past
      const exp = Basics.isObj(o.state.terms) && Basics.isStr(o.state.terms.expires) ? o.state.terms.expires : null;
      if (exp !== null && Bytes.cutoffsOn(L.name, pool).some(c => c.state.when === exp && Check.asList(c.refs.subject).includes(o.hash) && (c === cut || pool.sees(cut.hash, c.hash)))) continue;
      if (pool.all().some(s => s.state.status === 'stopped' && s.refs.updates === o.hash && pool.sees(cut.hash, s.hash))) continue;
      // at her quantity: each line of A's at its quantity
      const tot = Deals.termsTotalF(o.state.terms, Check.linesOf(A.state.terms).map(l => ({ id: l.id, quantity: l.quantity })));
      if (!tot || (lim && !Deals.sameKind(tot.kind, lim))) continue;
      if (!best || Deals.fcmp(tot.f, best.f) < 0 || (Deals.fcmp(tot.f, best.f) === 0 && i < best.i)) best = { f: tot.f, i, offer: o.hash, received: r.hash };
    }
  });
  return best ? { offer: best.offer, received: best.received, cutoff: cut.hash, why: null } : { offer: null, received: null, cutoff: cut.hash, why: 'none' };
}
// ---- the stop of a grant: a stop is seen by a block that has it in its causal past, or, where the grant names clocks, where the lines that show the stop before the block are `names` less `needed`, plus one
function stopSeenOnLine(name, b, E, pool) {
  const rb = Bytes.receiptsOn(name, b.hash, pool), re = E ? Bytes.receiptsOn(name, E.hash, pool) : [];
  for (const r of rb) {
    if (re.includes(r)) continue;
    if (re.some(e => Bytes.placedBefore(pool, e, r))) return 'after';
    if (re.every(e => Bytes.placedBefore(pool, r, e))) return 'passes';
  }
  return !rb.length && re.length ? 'after' : null;
}
function grantSeenBy(g, pool, relying) {
  const base = pool.seenBy(relying), ks = Basics.isObj(g.state.scope) ? Identity.clocksOf(g.state.scope.clocks) : null;
  if (!relying || !ks) return base;
  return h => {
    if (base(h)) return true;
    const E = pool.get(h);
    return !!E && ks.names.filter(n => stopSeenOnLine(n, relying, E, pool) === 'after').length >= ks.names.length - ks.needed + 1;
  };
}
// ---- a tool's word. Everything but the limit (the clauses a block must pass to be counted at all); null when it passes, else { code, detail }
function clauseProblem(b, g, pool) {
  const fail = (code, detail, extra) => ({ code, detail, ...extra });
  const sc = scopeOf(g), k = blockKind(b);
  if (!receives(g, b)) return fail('not_live', 'the signer is not the receiver of the grant');
  if (!grantLive(g, pool, new Set(), b)) return fail('not_live', 'the grant is not live');
  for (const x of grantChain(g, pool)) { // a grant passed on stands only where it fits its parent's line
    const up = x.refs.parent === undefined ? null : pool.get(x.refs.parent);
    if (up && up.type === 'grant' && (limitOf(up) || eachOf(up))) { const m = meterRead(up, pool, x); if (m.fits === false && !m.not_shown) return fail('not_live', 'the grant was passed on past its parent\'s line'); }
  }
  // Coming back: a hand-back (the holder's own transfer to_owner her, of what the grant's line holds) needs no type in `types`, no room under `limit` and no accept
  if (k === 'pay' && b.refs.to_owner === Things.principalOfChain(g, pool) && Check.asList(b.refs.what).length && Check.asList(b.refs.what).every(h => grantChain(g, pool).some(x => Check.asList(x.refs.what).includes(h)))) return null;
  if (b.state.handle !== undefined && g.state.handle !== b.state.handle) return fail('not_live', 'the grant does not name the handle');
  const names = typeNames(b);
  if (sc.types === undefined || !names.some(n => Check.asList(sc.types).includes(n))) return fail('not_live', 'the block\'s type is outside the grant\'s scope');
  const principal = Things.principalOfChain(g, pool), parties = Check.asList(sc.parties);
  const ans = Basics.isStr(b.refs.answers) ? pool.get(b.refs.answers) : null;
  const sides = ['from', 'to', 'to_owner', 'to_holder'].flatMap(x => Check.asList(b.refs[x]));
  if (ans) { const named = ['from', 'to'].flatMap(x => Check.asList(ans.refs[x])); sides.push(...(named.length ? named : Check.asList(ans.refs.author))); }
  const passing = k === 'pay' && isPassOn(b, g, pool);
  // "): a side is admitted where `parties` lists it, where a promise of hers in `on` names it (her own word
  // named him), or where it is a side of a deal a block under the grant made; a side an `on` promise leaves open admits anyone where the grant states no `parties`
  const ons = Check.asList(sc.on).map(h => pool.get(h)).filter(p => p && p.type === 'promise');
  const onSides = ons.flatMap(p => ['from', 'to'].flatMap(x => Check.asList(p.refs[x])));
  const openSide = sc.parties === undefined && ons.some(p => p.refs.from === undefined || p.refs.to === undefined);
  const madeSides = pool.all().filter(a => a.hash !== b.hash && a.refs.under === g.hash && a.type === 'promise' && a.state.status === 'accepted' && Basics.isStr(a.refs.answers)).flatMap(a => { const o = pool.get(a.refs.answers); return o ? [...['from', 'to'].flatMap(x => Check.asList(o.refs[x])), o.refs.author] : []; });
  const admitted = id => id === principal || openSide || parties.includes(id) || onSides.includes(id) || madeSides.includes(id);
  if (!passing && sides.some(id => !admitted(id))) return fail('not_live', 'a side the block deals with is outside the grant\'s parties');
  if (k === 'other') return fail('not_kept', 'a block of this kind speaks for its signer alone');
  // a make names what it draws on in `state.inputs: [{ from, amount }]` (authority.md, Blocks that bind): under a grant, every input is a thing the grant names in `refs.what`
  if (k === 'make') { const what = Check.asList(g.refs.what), froms = (Array.isArray(b.state.inputs) ? b.state.inputs : []).filter(i => Basics.isObj(i) && Basics.isStr(i.from)).map(i => i.from); if (!what.length || !froms.length || !froms.every(f => what.includes(f))) return fail('not_kept', 'a make under a grant that does not name what it is made from'); }
  const blocks = heldPromises(g, pool);
  let C = null, deal = null;
  if (k === 'promise' || k === 'accept') {
    C = promiseOf(b, pool);
    if (!C) return fail('not_kept', 'the promise it binds her to is not held');
    let best = null;
    for (const h of blocks) { const A = pool.get(h); if (!A) continue; const r = keepsTo(C, A, pool, { principal, parties }); if (r.keeps) { best = { A, keeps: true }; break; } if (!best || (!best.keeps && r.why < best.why)) best = { A, keeps: false, why: r.why }; }
    if (!best) return fail('not_kept', 'no promise of scope.on is held', { why: null });
    if (!best.keeps) return fail('not_kept', best.why, { why: best.why });
    // one fill for each occurrence
    const aT = Basics.isObj(best.A.state.terms) ? best.A.state.terms : {};
    if (k === 'accept' && aT.repeat !== undefined && Basics.isStr(C.state.occurrence)) {
      const filled = pool.all().some(x => x.hash !== b.hash && x.type === 'promise' && x.state.status === 'accepted' && Identity.counts(x, pool) && (() => {
        const Cx = promiseOf(x, pool);
        if (!Cx || Cx.state.occurrence !== C.state.occurrence || !keepsTo(Cx, best.A, pool, { principal, parties }).keeps) return false;
        if (pool.sees(b.hash, x.hash) || !pool.sees(x.hash, b.hash)) { return Things.speakerOf(x, pool) === principal; } // before it, or neither first
        return false;
      })());
      if (filled) return fail('not_kept', 'the occurrence is already filled');
    }
    deal = firstPromiseOf(C, pool);
  } else if (k === 'make') { // a make under a grant that names an instance: the draw is counted on that part's line (Toll work)
  } else if (k === 'pay' && isPassOn(b, g, pool)) { // a block of a tool of hers that gives a part its line holds to another tool of hers passes that part; it gives nothing away
    return null;
  } else { // a payment, a delivery, or a word about what is hers to receive: of a deal in scope.on, or one a block under the same grant made
    deal = dealFor(b, pool);
    const made = deal && (blocks.includes(deal.hash) || pool.all().some(x => x.refs.under === g.hash && ['promise', 'accept'].includes(blockKind(x)) && dealKeyOf(x, pool) === deal.hash));
    if (!made) return fail('not_kept', 'a deal not in scope.on and not made under this grant');
    if (k === 'pay') { const due = notDueBecause(b, deal, principal, pool); if (due) return fail('not_due', due); }
  }
  // her stop of one thing ends, for that thing only, every draw under her grants until she lifts it
  {
    const things = new Set([...Check.whatsOf(b), ...(C ? Check.whatsOf(C) : []), ...Check.asList(b.refs.derives_from)]);
    const handBack = k === 'pay' && b.refs.to_owner === principal;
    if (things.size && !handBack) {
      const seenBy = grantSeenBy(g, pool, b);
      for (const S of pool.all()) {
        if (S.type !== 'observe' || S.state.status !== 'stopped' || S.state.stop !== 'onward' || S.refs.updates !== undefined || S.refs.answers !== undefined || S.refs.author !== principal || !Identity.counts(S, pool)) continue;
        const T0 = Check.asList(S.refs.what)[0];
        if (!things.has(T0) || !seenBy(S.hash)) continue;
        const lifted = pool.all().some(x => x.type === 'observe' && x.state.status === 'resumed' && x.refs.updates === S.hash && x.refs.author === principal && Identity.counts(x, pool) && pool.sees(b.hash, x.hash) && Identity.standsOf(x, pool).stands);
        if (lifted) continue;
        if (Deals.isAmount(S.state.amount)) { // with `amount`, it reaches only a block after which the grant's line would hold less than that much of the thing undrawn
          const th = pool.get(T0), pack = th && Deals.isAmount(th.state.pack) ? th.state.pack : null;
          const part = limitOf(g) && pack && Deals.sameKind(limitOf(g), pack) ? limitOf(g) : pack;
          const amt = x => (Deals.isAmount(x.state.amount) ? x.state.amount : (Array.isArray(x.state.inputs) ? (x.state.inputs.find(i => Basics.isObj(i) && i.from === T0) || {}).amount : null));
          const drawn = pool.all().filter(x => x.refs.under === g.hash && (x === b || pool.sees(b.hash, x.hash)) && Check.asList(x.refs.what).concat(Check.asList(x.refs.derives_from)).includes(T0) && Deals.isAmount(amt(x))).map(x => Deals.dec(amt(x).value));
          if (part && Deals.fcmp(Deals.fsub(Deals.dec(part.value), Deals.fsumF(drawn)), Deals.dec(S.state.amount.value)) >= 0) continue;
        }
        return fail('stopped_thing', 'her stop of one thing reaches this block');
      }
    }
  }
  // no one is both sides of a word: a block that gives to its own signer, to a key linked to the signer, or to a circle she belongs to speaks for no one else, unless a promise in scope.on names that side
  {
    const signer = b.refs.author, named = new Set(blocks.flatMap(h => { const A = pool.get(h); return A ? ['from', 'to'].flatMap(x => Check.asList(A.refs[x])) : []; }));
    const gives = [...sides].filter(x => x !== principal);
    const circleHas = x => Circles.handCouldCount(signer, x, pool, pool.before(b.hash));
    if (gives.some(x => !named.has(x) && (x === signer || keysLinked(signer, x, pool) || circleHas(x)))) return fail('both_sides', 'a block that gives to its own signer, or to a key linked to it, speaks for no one else');
  }
  // the deadline, read by its place on the line refs.meter names (a cutoff through it, refs.subject the grant); a date orders nothing but the block's own, against its own signer
  if (k === 'accept' && Basics.isStr(sc.deadline)) {
    const L = meterLine(g, pool), v = L && !L.missing ? standsAgainstTime(L, b.hash, sc.deadline, g.hash, pool) : null;
    if (sc.fallback === 'lowest') {
      if (v === 'before') return fail('not_live', 'with a fallback, no accept under the grant counts before the deadline');
      if (v === null) return fail('waiting', 'the meter\'s line has not shown the accept before or after the deadline', { waiting: [{ block: b.hash, on: 'meter' }] });
      const lo = lowestOffer(g, pool), A = pool.get(b.refs.answers);
      if (!A || A.hash !== lo.offer) return fail('after_deadline', 'after the deadline only her tool\'s accept of the lowest offer counts');
    } else {
      const ownLate = Basics.isStr(b.state.at) ? Date.parse(b.state.at) >= Date.parse(sc.deadline) : v !== 'before'; // its own date shows it late against its own signer; with none, it is in time only where the line shows it before
      if (v === 'after' || ownLate) return fail('after_deadline', 'nothing under the grant accepts after its deadline');
    }
  }
  return null;
}
// a transfer by the holder, of the part the grant's line holds (refs.what of the grant), to another tool of the same giver (a live grant of hers made to that key); it names no deal
function isPassOn(b, g, pool) {
  const parts = grantChain(g, pool).flatMap(x => Check.asList(x.refs.what));
  const what = Check.asList(b.refs.what);
  if (!what.length || !what.every(h => parts.includes(h)) || !Basics.isStr(b.refs.to_owner) || b.refs.for !== undefined) return false;
  const principal = Things.principalOfChain(g, pool);
  return pool.all().some(x => x.type === 'grant' && x.state.status === undefined && x.refs.parent === undefined && x.refs.author === principal && x.refs.to === b.refs.to_owner && x.hash !== g.hash);
}
// what a payment or a delivery is due on (promises.md, Due): the deal's binding accept standing in its causal past; the deal's condition, held; what `waits_on` names, standing. null when due, else why not
function notDueBecause(b, D, principal, pool) {
  const past = pool.past(b.hash), t = Basics.isObj(D.state.terms) ? D.state.terms : {};
  const delivery = Check.asList(b.refs.what).length > 0;
  const accept = pool.all().some(x => past.has(x.hash) && x.type === 'promise' && x.state.status === 'accepted' && Identity.counts(x, pool) && dealKeyOf(x, pool) === D.hash && Identity.standsOf(x, pool).stands);
  if (!accept) return 'the deal\'s binding accept is not in its past';
  if (t.condition !== undefined && Bytes.conditionHolds(t.condition, pool.all().filter(x => past.has(x.hash))) !== true) return 'the deal\'s condition has not held';
  const goodsTo = D.refs.to, payee = D.refs.from;
  const wordsOf = who => pool.all().filter(x => past.has(x.hash) && Identity.counts(x, pool) && Things.speakerOf(x, pool) === who);
  if (t.waits_on === 'goods' && !delivery) {
    const came = wordsOf(goodsTo).some(x => (x.type === 'transfer' && x.state.status === 'accepted' && Check.asList(x.refs.answers).some(h => { const tr = pool.get(h); return !!tr && tr.type === 'transfer' && Check.asList(tr.refs.for).includes(D.hash); })) || (x.type === 'observe' && x.state.kind === 'received' && Check.asList(x.refs.for).concat(Check.asList(x.refs.subject)).includes(D.hash)));
    if (!came) return 'the price waits on the receiver\'s word that the goods came';
  }
  if (t.waits_on === 'price' && delivery) {
    const paid = wordsOf(payee).some(x => x.type === 'observe' && x.state.kind === 'paid' && Check.asList(x.refs.subject).concat(Check.asList(x.refs.for)).includes(D.hash));
    if (!paid) return 'what moves waits on the payee\'s signal that the price is paid';
  }
  // of what the deal names her side to hand over, no more
  if (delivery) { if (principal !== D.refs.from) return 'a delivery is by the side that gives the goods'; }
  else {
    if (principal !== D.refs.to && D.refs.to !== undefined) return 'a payment is by the side that pays';
    const chosen = (() => { for (const x of pool.all()) if (past.has(x.hash) && x.type === 'promise' && x.state.status === 'accepted' && dealKeyOf(x, pool) === D.hash && Basics.isObj(x.state.terms) && x.state.terms.lines !== undefined) return x.state.terms.lines; return undefined; })();
    const tot = Deals.termsTotalF(t, chosen);
    if (!tot || !Deals.isAmount(b.state.amount) || !Deals.sameKind(b.state.amount, tot.kind) || Deals.fcmp(Deals.dec(b.state.amount.value), tot.f) > 0) return 'a payment is of what the deal names, no more';
    if (b.refs.to_owner !== undefined && b.refs.to_owner !== payee) return 'a payment goes to the other side';
  }
  return null;
}
function whyNotUnder(b, poolIn) {
  const pool = Check.poolOf(poolIn);
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
  const c = clauseProblem(b, g, pool);
  if (c) return [c];
  // Coming back needs no room on the line
  const principal = Things.principalOfChain(g, pool);
  if (!(b.type === 'transfer' && b.state.status === undefined && Check.asList(b.refs.to_owner).length === 1 && b.refs.to_owner === principal && g.refs.what !== undefined)) {
    const m = meterRead(g, pool, b);
    if (m.not_shown) return fail('not_shown', 'the grant\'s line is not read whole', { lacks: m.lacks });
    if (!m.fits) {
      if (Basics.isObj(m.why) && m.why.pair) return fail('pair', 'a pair on the grant\'s line', { pair: m.why });
      return fail(Basics.isStr(m.why) ? m.why : 'past', 'the block does not fit on the grant\'s line');
    }
  }
  const st = Identity.standsOf(b, pool);
  if (!st.stands) return fail('waiting', 'the block does not stand yet', { waiting: st.waiting });
  return [];
}

// ---- write checks of grants
// price and quantity of a promise or a line: a range or a list at each (set_places), else as before. A quantity range needs no per-unit price.
function priceAndQuantity(price, quantity) {
  const out = [];
  if (isRL(price)) { const q = rangeListProblem(price); if (q) out.push(q); } else out.push(...Check.priceProblems(price));
  if (isRL(quantity)) { const q = rangeListProblem(quantity); if (q) out.push(q); } else out.push(...Check.quantityProblems(quantity, isRL(price) ? { per: {} } : price));
  return out;
}
// a grant's own ending term `scope.ends_on` (protocol.json shapes.ends_on): both keys, `witness` an id (`grammar`), `said` text; anything else `shape`
function endsOnProblem(e) {
  const want = Basics.P.shapes.ends_on;
  if (!Basics.isObj(e) || Object.keys(e).length !== want.length || !want.every(k => k in e)) return 'shape';
  if (!Basics.isStr(e.said)) return 'shape';
  if (!(Basics.isStr(e.witness) && Check.RX.id.test(e.witness))) return 'grammar';
  return null;
}
// her own ending term reached: a counted observe of kind witness signed by the host `ends_on.witness` names, saying exactly `ends_on.said`, `for` the grant (and with the
// grant's own `state.handle`, where it states one), seen (as her own stop is: for a block that has it in its causal past)
function endsOnReached(g, pool, seen) {
  const e = Basics.isObj(g.state.scope) ? g.state.scope.ends_on : undefined;
  if (endsOnProblem(e)) return false;
  return pool.all().some(w => w.type === 'observe' && w.state.kind === 'witness' && w.refs.author === e.witness && w.state.said === e.said && Check.asList(w.refs.for).includes(g.hash) && (g.state.handle === undefined || Bytes.jcs(w.state.handle) === Bytes.jcs(g.state.handle)) && seen(w.hash) && Identity.counts(w, pool));
}
// a child grant: never open and never to a role (`shape`); its scope no wider than its parent's on every field, else `wider_than_parent`
function childProblem(cs, cr, parent, blocks) {
  if (cr.to === undefined) return 'shape';
  const ps = parent.state, pr = parent.refs, c = Basics.isObj(cs.scope) ? cs.scope : {}, p = Basics.isObj(ps.scope) ? ps.scope : {};
  const same = (x, y) => (x === undefined || y === undefined ? x === y : Bytes.jcs(x) === Bytes.jcs(y));
  const subset = (x, y) => Check.asList(x).every(v => Check.asList(y).some(w => Bytes.jcs(v) === Bytes.jcs(w)));
  if (!subset(c.types, p.types === undefined ? [] : p.types) || !subset(c.parties, p.parties === undefined ? [] : p.parties) || !subset(c.on, p.on === undefined ? [] : p.on)) return 'wider_than_parent';
  if (c.every !== undefined && p.limit !== undefined) return 'wider_than_parent';
  if (p.each !== undefined && (c.each === undefined || !Deals.sameKind(c.each, p.each) || Deals.decCmp(c.each.value, p.each.value) > 0)) return 'wider_than_parent';
  if (c.each !== undefined && p.each === undefined) return 'wider_than_parent';
  if (p.expires !== undefined && (c.expires === undefined || c.expires > p.expires)) return 'wider_than_parent';
  for (const f of ['clocks', 'deadline', 'fallback']) if (!same(c[f], p[f])) return 'wider_than_parent';
  if (cr.what !== undefined && !same(cr.what, pr.what)) return 'wider_than_parent';
  if (pr.meter !== undefined && cr.meter !== pr.meter) { // the parent's, where it is not the parent holder's own line
    const m = blocks && blocks.get ? blocks.get(pr.meter) : undefined;
    const own = !!m && ((m.type === 'actor' && m.refs.author === undefined && m.hash === pr.to) || m.refs.author === pr.to || m.refs.subject === pr.to);
    if (!own) return 'wider_than_parent';
  }
  if (pr.meter === undefined && cr.meter !== undefined) return 'wider_than_parent';
  if (ps.handle !== undefined && cs.handle !== ps.handle) return 'wider_than_parent';
  const pd = ps.depth === undefined ? 0 : ps.depth, cd = cs.depth === undefined ? 0 : cs.depth;
  return pd >= 1 && cd <= pd - 1 ? null : 'wider_than_parent';
}
Object.assign(module.exports, { typeNames, receives, ended, grantLive, isRangeV, isListV, isRL, rangeListProblem, keepsTo, scopeOf, limitOf, grantChain, keysLinked, meterLine, cmpDurations, isAcceptOfPromise, measuresOf, keptBy, meterRead, lowestOffer, isPassOn, whyNotUnder, priceAndQuantity, endsOnProblem, childProblem });
