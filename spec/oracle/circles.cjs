'use strict';
// The oracle's part for circles (circles.md).
const Basics = require('./basics.cjs');
const Bytes = require('./bytes.cjs');
const Check = require('./check.cjs');
const Consent = require('./consent.cjs');
const Deals = require('./deals.cjs');
const Grants = require('./grants.cjs');
const Identity = require('./identity.cjs');
const Things = require('./things.cjs');
// ================================================================ circles (circles.md; folds.md)
// A circle is people who own things together, and the rows by which some of them act for the owners. It never signs and holds no key: a block `as` it is a person's own word, and
// speaks for the owners only where one row holds for it (its hands counted in one place) or where every owner signs it together. Parts are title. Nothing here fills a silence.
const isCircleBlock = b => !!b && b.type === 'actor' && b.state.kind === 'circle';
const isFoundingCircle = b => isCircleBlock(b) && b.refs.updates === undefined && b.refs.as === undefined;
// pack: whole parts (an amount of unit `part`, a whole number of at least 1, no `of`)
const packOf = C => (C && Basics.isObj(C.state.pack) && Deals.isAmount(C.state.pack) && C.state.pack.unit === 'part' && !('of' in C.state.pack) && /^[1-9][0-9]*$/.test(C.state.pack.value) ? C.state.pack : null);
const wholeN = n => Number.isInteger(n) && n >= 1;
// a row is exactly { parts, scope } or { to, needed, scope }; every number whole and at least 1 (never `all`, never a share); `to` ids or one grant id; scope an object read as a grant's
function rowShapeOk(row, hasPack) {
  if (!Basics.isObj(row) || !Basics.isObj(row.scope)) return false;
  const ks = Object.keys(row).sort().join(',');
  if (ks === 'parts,scope') return hasPack && wholeN(row.parts) && scopeShapeOk(row.scope);
  if (ks === 'needed,scope,to') return wholeN(row.needed) && ((Array.isArray(row.to) && row.to.length > 0 && row.to.every(x => Basics.isStr(x) && Check.RX.id.test(x))) || (Basics.isStr(row.to) && Check.RX.id.test(row.to))) && scopeShapeOk(row.scope);
  return false;
}
function scopeShapeOk(sc) {
  if (Object.keys(sc).some(k => !Basics.P.scope.includes(k) && k !== 'what')) return false;
  for (const k of ['limit', 'each']) if (sc[k] !== undefined && (Check.amountProblem(sc[k]) || Deals.decCmp(sc[k].value, '0') < 0)) return false;
  if (sc.types !== undefined && !(Array.isArray(sc.types) && sc.types.every(Basics.isStr))) return false;
  if (sc.what !== undefined && sc.what !== 'any' && !Check.asList(sc.what).every(x => Basics.isStr(x) && Check.RX.id.test(x))) return false;
  return true;
}
const rowsOf = S => (Array.isArray(S && S.rules) ? S.rules : []);
const rowNamesActor = R => Basics.isObj(R) && Basics.isObj(R.scope) && Check.asList(R.scope.types).some(t => t === 'actor' || (Basics.isStr(t) && t.startsWith('actor.')));
// the versions of a circle held: actors of kind circle signed `as` it that update the founding block or an earlier version, sorted by hash
function circleVersionsOf(F, pool) {
  const cand = pool.all().filter(b => isCircleBlock(b) && b.refs.as === F && Basics.isStr(b.refs.updates) && Identity.counts(b, pool));
  const known = new Set([F]), out = [];
  for (let grew = true; grew;) { grew = false; for (const b of cand) if (!known.has(b.hash) && known.has(b.refs.updates)) { known.add(b.hash); out.push(b); grew = true; } }
  return out.sort(Basics.byHash);
}
// the block whose rows, clocks and meter stand for a causal past: of the versions that hold in it (all held with no past), the one every other is in the past of;
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
  return { C, version: stand === C ? null : stand.hash, stand, state: S, rows: rowsOf(S), clocks: Basics.isObj(S.clocks) ? S.clocks : null, meter: Basics.isStr(stand.refs.meter) ? stand.refs.meter : null, pack: packOf(C) };
}
// the rows that stand for a block `as` the circle: for an actor `as` it, only the founding block's rows that name `actor`; for any other block, the standing block's rows
// (read in the block's own causal past), rows naming `actor` read only from the founding block
function rowsFor(F, b, pool) {
  const C = pool.get(F);
  if (!isFoundingCircle(C)) return [];
  const all = rowsOf(C.state).map((R, i) => ({ R, i }));
  if (b.type === 'actor') return all.filter(x => rowNamesActor(x.R));
  const cn = circleNow(F, pool, pool.past(b.hash));
  return rowsOf(cn.state).map((R, i) => ({ R, i })).filter(x => cn.version === null || !rowNamesActor(x.R));
}
// the parts of a circle read in a causal past (the ownership fold of the circle itself): { none } with no pack, { not_shown, lacks }, or { map: id -> free parts,
// title: id -> parts owned (held draws included), unissued (the circle's own free parts), unissuedTitle }. A draw of hers that the move (or a move it confirms) answers is added
// back to her free parts (the parts are hers until the receiver's yes).
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
  if (past && !past.has(F)) return { map: new Map(), title: new Map(), unissued: Deals.F0, unissuedTitle: Deals.F0, heldAll: new Map(), draws: [] };
  const r = Things.ownershipFold(C, pool, past || undefined, '');
  if (r.not_shown) return { not_shown: true, lacks: r.lacks };
  const map = new Map(), title = new Map(), heldAll = new Map();
  const add = (m, k, v) => m.set(k, Deals.fadd(m.get(k) || Deals.F0, v));
  for (const o of r.owners) { const a = o.amount ? Deals.dec(o.amount.value) : Deals.F0; add(map, o.owner, a); add(title, o.owner, a); }
  for (const d of r.draws) if (d.takes && d.state === 'held' && Basics.isStr(d.by) && d.amount) {
    const a = Deals.dec(d.amount.value);
    add(title, d.by, a); if (d.by !== F) add(heldAll, d.by, a);
    if (addBack && addBack.has(d.block) && d.by !== F) add(map, d.by, a);
  }
  const unissued = map.get(F) || Deals.F0, unissuedTitle = title.get(F) || Deals.F0;
  map.delete(F); title.delete(F);
  return { map, title, unissued, unissuedTitle, heldAll, draws: r.draws };
}
const partsOf = (cp, id) => (cp.map && cp.map.get(id)) || Deals.F0;
const titleOf = (cp, id) => (cp.title && cp.title.get(id)) || Deals.F0;
// the ids a move gives to: a transfer's to_owner and to_holder; a grant's refs.to; an offer's or order's (a promise with no status that answers nothing) sides from and to;
// an accept of a promise: that promise's from, to and author; an accept of a transfer gives nothing; never the circle itself
function givesToIds(m, F, pool) {
  const ids = [], st = m.state.status;
  if (m.type === 'transfer' && st === undefined) for (const k of ['to_owner', 'to_holder']) ids.push(...Check.asList(m.refs[k]));
  else if (m.type === 'grant' && st === undefined) ids.push(...Check.asList(m.refs.to));
  else if (m.type === 'promise' && st === undefined && m.refs.answers === undefined) for (const k of ['from', 'to']) ids.push(...Check.asList(m.refs[k]));
  else if (st === 'accepted') { const p = pool.get(Check.asList(m.refs.answers)[0]); if (p && p.type === 'promise') for (const k of ['from', 'to', 'author']) ids.push(...Check.asList(p.refs[k])); }
  return [...new Set(ids.filter(x => Basics.isStr(x) && x !== F))].sort();
}
// whether `who`'s hand could count in a circle, read in a causal past (all held with none): she owns parts of it by title, or a row's `to` names her (or a grant it names does)
function handCouldCount(who, X, pool, past) {
  if (!isFoundingCircle(pool.get(X))) return false;
  const cp = circleParts(X, pool, past || null);
  if (cp.title && Deals.fpos(titleOf(cp, who))) return true;
  const cn = circleNow(X, pool, past || null);
  const seen = past ? (h => past.has(h)) : (() => true);
  return cn.rows.some(R => Basics.isObj(R) && R.to !== undefined && rowNamed(R.to, X, pool, seen).includes(who));
}
// an id is hers for a move: herself, a key linked to hers, a tool of hers (the holder of a counted grant she signed in her own name, in the move's causal past), or a
// circle in which her hand could count
function isHersFor(r, who, m, pool) {
  if (r === who) return true;
  if (Grants.keysLinked(who, r, pool)) return true;
  const past = pool.past(m.hash);
  if (pool.all().some(g => g.type === 'grant' && g.state.status === undefined && g.refs.author === who && g.refs.as === undefined && Check.asList(g.refs.to).includes(r) && past.has(g.hash) && Identity.counts(g, pool))) return true;
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
// the ids a row's `to` names, as they stand for `seen`: each id, or for an id that is a grant `as` the circle that holds, the holders it names as it stands
function rowNamed(to, F, pool, seen) {
  const out = [];
  for (const id of Check.asList(to)) { const g = pool.get(id); if (g && g.type === 'grant' && g.refs.as === F) out.push(...grantHolders(g, F, pool, seen)); else out.push(id); }
  return [...new Set(out.filter(Basics.isStr))].sort();
}
// the holders of a head-count grant as it stands: its newest newer word `as` the circle that holds (a chain of words, each updating one before it); none where a holding
// stop of it is seen; where two newer words do not see each other, only the ids both name; less each holder who ended her own place
function grantHolders(g, F, pool, seen) {
  if (!seen(g.hash) || !rowHoldsMemo(g, F, pool).holds) return [];
  const words = [g];
  const cand = pool.all().filter(u => u.type === 'grant' && u.refs.as === F && Basics.isStr(u.refs.updates) && seen(u.hash) && Identity.counts(u, pool));
  for (let grew = true; grew;) { grew = false; for (const u of cand) if (!words.includes(u) && words.some(w => w.hash === u.refs.updates) && rowHoldsMemo(u, F, pool).holds) { words.push(u); grew = true; } }
  if (words.some(w => w.state.status === 'stopped')) return [];
  const newer = words.filter(w => w.state.status === undefined);
  const heads = newer.filter(w => !newer.some(y => y !== w && pool.sees(y.hash, w.hash)));
  let ids;
  if (heads.length <= 1) ids = Check.asList((heads[0] || g).refs.to);
  else { const sets = heads.map(w => Check.asList(w.refs.to)); ids = sets[0].filter(x => sets.every(s => s.includes(x))); }
  const ownEnd = x => pool.all().some(u => u.refs.author === x && seen(u.hash) && Identity.counts(u, pool) && u.refs.as === undefined && words.some(w => (u.refs.updates === w.hash && u.type === 'grant' && ['stopped', 'declined'].includes(u.state.status)) || (u.refs.answers === w.hash && (u.state.status === 'declined' || u.state.status === 'stopped'))));
  return ids.filter(x => Basics.isStr(x) && !ownEnd(x));
}
// the amount a block binds: a transfer's state.amount; an offer's or order's total; an accept's total of the promise it accepts; no other block has one
function blockMoney(b, pool) {
  const st = b.state.status;
  if (b.type === 'transfer' && st === undefined) return Deals.isAmount(b.state.amount) ? b.state.amount : null;
  let on = null;
  if (b.type === 'promise' && st === undefined && b.refs.answers === undefined) on = b;
  else if (st === 'accepted' && pool) { const p = pool.get(Check.asList(b.refs.answers)[0]); if (p && p.type === 'promise') on = p; }
  if (!on || !Basics.isObj(on.state.terms)) return null;
  return Deals.termsTotal(on.state.terms, st === 'accepted' && Basics.isObj(b.state.terms) ? b.state.terms.lines : undefined);
}
// A row's money cap reads a sale's draw as its money total, as a grant's draw is read (authority.md, A draw). A transfer of goods that is `for` a deal with a price is its
// line's share: the line's price at the amount it moves (1 kg of a £3/kg line is £3, whatever the rest of the order comes to); the line is the one it names in state.line,
// else the one line in the amount's kind. A transfer of goods with no priced line has no money total here, so its amount (another kind) stands above the cap (a bound bounds
// every kind; nothing fills the silence of a price).
function rowMoney(b, cap, pool) {
  const a = blockMoney(b, pool);
  if (!a || !cap || Deals.sameKind(a, cap)) return a;
  if (b.type === 'transfer' && b.state.status === undefined) {
    for (const d of Check.asList(b.refs.for)) {
      const deal = pool.get(d);
      if (!deal || deal.type !== 'promise' || !Basics.isObj(deal.state.terms)) continue;
      const lines = Check.linesOf(deal.state.terms);
      const inKind = lines.filter(l => { const q = Grants.isRL(l.quantity) ? Consent.rangeEnds(l.quantity).hi : l.quantity; return Deals.isAmount(q) && Deals.sameKind(q, a); });
      const line = Basics.isStr(b.state.line) ? lines.find(l => l.id === b.state.line) : inKind.length === 1 ? inKind[0] : undefined;
      const part = line && Basics.isObj(line.price) ? Deals.totalOf(line.price, a) : null;
      const t = part ? Deals.amtOut(part.f, part.kind) : null;
      if (t && Deals.sameKind(t, cap)) return t;
    }
  }
  return a;
}
// the blocks `as` the circle, in a block's causal past, that bound deal d: a promise that holds by a row, and is d, is `for` d or answers d
function bindersOf(b, d, F, pool) {
  const past = pool.past(b.hash);
  return pool.all().filter(x => past.has(x.hash) && x.refs.as === F && x.type === 'promise' && (x.hash === d || Check.asList(x.refs.for).includes(d) || Check.asList(x.refs.answers).includes(d)) && (x.state.status === undefined || x.state.status === 'accepted') && rowHoldsMemo(x, F, pool).holds);
}
// counted once: a block `for` a deal the circle bound, where the binding block `as` the circle holds in its causal past, draws on nothing new
function countedWhenBound(b, F, pool) {
  return Check.asList(b.refs.for).some(d => bindersOf(b, d, F, pool).length > 0);
}
// a grant from a row is no wider than the row, on every field, as a child grant is no wider than its parent: its types, parties and on within the row's; under the
// row's each, an each no higher, or no each and a limit no higher than it; under the row's limit, a limit no higher; with neither, no limit or each at all; refs.what
// inside the row's scope.what, and with none, no refs.what
function widerThanRow(g, rs) {
  const gs = Basics.isObj(g.state.scope) ? g.state.scope : {};
  const subset = (x, y) => y === 'any' || Check.asList(x).every(v => Check.asList(y).some(w => Bytes.jcs(v) === Bytes.jcs(w)));
  if (!subset(gs.types, rs.types) || !subset(gs.parties, rs.parties) || !subset(gs.on, rs.on)) return true;
  const within = (a, r) => Deals.isAmount(a) && Deals.sameKind(a, r) && Deals.fcmp(Deals.dec(a.value), Deals.dec(r.value)) <= 0;
  if (Deals.isAmount(rs.each) && !(within(gs.each, rs.each) || (gs.each === undefined && within(gs.limit, rs.each)))) return true;
  if (Deals.isAmount(rs.limit) && !within(gs.limit, rs.limit)) return true;
  if (!Deals.isAmount(rs.each) && !Deals.isAmount(rs.limit) && (gs.limit !== undefined || gs.each !== undefined)) return true;
  if (!subset(g.refs.what, rs.what)) return true;
  return false;
}
// the period a block falls in under a row's `every`: the cutoffs on the circle's meter line whose refs.subject is the circle, a span no shorter than `every`, before the
// block's first receipt there; with no meter no period turns
function rowPeriod(R, b, F, meter, pool) {
  if (!Basics.isStr(R.scope.every) || !Basics.isStr(meter)) return 0;
  const line = Bytes.clockLine(meter, pool);
  const cuts = line.filter(c => c.type === 'observe' && c.state.kind === 'cutoff' && Check.asList(c.refs.subject).includes(F) && Basics.isStr(c.state.when) && Check.parseDur(c.state.when) && Grants.cmpDurations(c.state.when, R.scope.every) >= 0);
  const r = line.find(o => o.type === 'observe' && o.state.kind === 'receipt' && Check.asList(o.refs.derives_from).includes(b.hash));
  return r ? cuts.filter(c => pool.sees(r.hash, c.hash)).length : 0;
}
// whether a row's scope covers a move, read as a grant's scope is, on the circle's chain: what the row does not state, it does not allow (circles.md, What a row leaves out)
function rowCovers(Ri, m, F, pool, meter) {
  const R = Ri.R, sc = R.scope, st = m.state.status;
  // (1) its type
  if (sc.types === undefined || !Grants.typeNames(m).some(t => Check.asList(sc.types).includes(t))) return false;
  // (3) a promise keeps to a promise in `on`; a transfer, or an accept of one, is `for` a promise in `on` or a deal the circle bound
  const ons = sc.on === 'any' ? [] : Check.asList(sc.on).map(h => pool.get(h)).filter(A => A && A.type === 'promise');
  const isP = (m.type === 'promise' && st === undefined) || Grants.isAcceptOfPromise(m, pool);
  const isX = m.type === 'transfer' && (st === undefined || st === 'accepted');
  const deals = isX ? [...new Set([...Check.asList(m.refs.for), ...(st === 'accepted' ? Check.asList((pool.get(Check.asList(m.refs.answers)[0]) || { refs: {} }).refs.for) : [])])] : Check.asList(m.refs.for);
  const binders = deals.flatMap(d => bindersOf(m, d, F, pool));
  if (isP && sc.on !== 'any') { const C = Grants.isAcceptOfPromise(m, pool) ? pool.get(m.refs.answers) : m; if (!C || !Grants.keptBy(C, ons, pool)) return false; }
  if (isX && sc.on !== 'any' && !deals.some(d => ons.some(A => A.hash === d) || bindersOf(m, d, F, pool).length > 0)) return false;
  // (4) each thing it names: in `scope.what`; a block of a deal under (3) names what its deal names; the circle's own parts only where `scope.what` names the circle
  const what = Check.whatsOf(m);
  if (sc.what === 'any') { /* every thing */ }
  else if (sc.what !== undefined) { const ok = Check.asList(sc.what); if (!what.every(w => ok.includes(w))) return false; }
  else if (what.includes(F) || (!isP && !isX && what.length)) return false;
  // (2) each side it gives to is admitted: `parties`, a side an `on` promise names, a side of a deal the circle bound; with no `parties`, anyone on a side an `on` promise leaves open.
  // `any` at `parties`, `on` or `what` is her word for every side, every deal, every thing
  const openSide = sc.parties === undefined && ons.some(A => A.refs.from === undefined || A.refs.to === undefined);
  const sidesOf = x => (x ? ['from', 'to', 'author'].flatMap(k => Check.asList(x.refs[k])) : []);
  const boundSides = [...deals.map(d => pool.get(d)), ...binders, ...binders.map(x => pool.get(Check.asList(x.refs.answers)[0]))].flatMap(sidesOf);
  const admitted = r => sc.parties === 'any' || openSide || Check.asList(sc.parties).includes(r) || ons.some(A => ['from', 'to'].some(k => Check.asList(A.refs[k]).includes(r))) || boundSides.includes(r);
  if (givesToIds(m, F, pool).some(r => !admitted(r))) return false;
  if (m.type === 'grant' && m.state.status === undefined && m.state.kind !== 'key' && widerThanRow(m, sc)) return false; // a grant wider than its row: no row holds for it, it waits
  if (Basics.isStr(sc.expires) && Basics.timeMs(sc.expires) !== null && (Basics.atMs(m) === null || Basics.timeMs(sc.expires) <= Basics.atMs(m))) return false;
  const each = Basics.isObj(sc.each) ? sc.each : null, limit = Basics.isObj(sc.limit) ? sc.limit : null;
  // (5) a row that states no limit and no each lets nothing be drawn: no block under it binds or moves an amount above zero, as a grant's silence does (authority.md, What she did not write)
  if (!each && !limit) { const a = blockMoney(m, pool); if (a && Deals.fcmp(Deals.dec(a.value), Deals.dec('0')) > 0 && !countedWhenBound(m, F, pool)) return false; }
  if (each || limit) {
    const a = rowMoney(m, each || limit, pool);
    if (a && !countedWhenBound(m, F, pool)) {
      if (each && (!Deals.sameKind(a, each) || Deals.fcmp(Deals.dec(a.value), Deals.dec(each.value)) > 0)) return false;
      if (limit) {
        if (!Deals.sameKind(a, limit)) return false;
        const past = pool.past(m.hash), per = rowPeriod(R, m, F, meter, pool);
        let used = Deals.dec(a.value);
        for (const b of pool.all()) {
          if (!past.has(b.hash) || b.refs.as !== F || countedWhenBound(b, F, pool)) continue;
          const x = rowMoney(b, limit, pool);
          if (!x || !Deals.sameKind(x, limit)) continue;
          const r = rowHoldsMemo(b, F, pool);
          if (!r.holds || r.row !== Ri.i || Bytes.jcs(rowsFor(F, b, pool).find(y => y.i === Ri.i)?.R ?? null) !== Bytes.jcs(R)) continue;
          if (rowPeriod(R, b, F, meter, pool) !== per) continue;
          used = Deals.fadd(used, Deals.dec(x.value));
        }
        if (Deals.fcmp(used, Deals.dec(limit.value)) > 0) return false;
      }
    }
  }
  return true;
}
// the row's (or grant's) scope.on names a promise the move is `for`, and that promise names her in `from` or `to`
function onNamesHer(R, who, m, pool) {
  const fors = Check.asList(m.refs.for);
  return Check.asList(R.scope.on).some(h => { if (!fors.includes(h)) return false; const A = pool.get(h); return !!A && A.type === 'promise' && ['from', 'to'].some(k => Check.asList(A.refs[k]).includes(who)); });
}
// the unissued parts the circle's meter's receipts of the move state: counted receipts on the meter's line naming the move, `state.unissued` an amount in `part`; several
// must agree; null where there are none, they differ, or there is no meter
function unissuedStated(m, meter, pool) {
  if (!Basics.isStr(meter)) return null;
  const vals = Bytes.receiptsOn(meter, m.hash, pool).filter(r => Deals.isAmount(r.state.unissued) && r.state.unissued.unit === 'part' && r.state.unissued.of === undefined).map(r => Deals.dec(r.state.unissued.value));
  if (!vals.length || vals.some(v => Deals.fcmp(v, vals[0]) !== 0)) return null;
  return vals[0];
}
// stands with `hands` left out: a hand stands as her word would (her key's wait, reach and bounds), never on the circle's rows
function standsNoHands(b, pool) {
  pool._snh = pool._snh || new Map();
  if (pool.get(b.hash) === b && pool._snh.has(b.hash)) return pool._snh.get(b.hash);
  const t0 = pool._taint || 0;
  const r = Identity.standsNow(b, pool, true);
  if (pool.get(b.hash) === b && (pool._taint || 0) === t0) pool._snh.set(b.hash, r);
  return r;
}
// whether a block has seen an end E: E is in its causal past (or is it), or the circle's clock received E before it received the block
function circleSaw(x, E, clock, pool) {
  if (E.hash === x.hash || pool.sees(x.hash, E.hash)) return true;
  if (!clock) return false;
  // a line received E before x: a receipt of E that every receipt of x has in its past (a line that has not received x says nothing of it)
  const before = n => { const rx = Bytes.receiptsOn(n, x.hash, pool), re = Bytes.receiptsOn(n, E.hash, pool); return rx.length > 0 && re.some(e => rx.every(r => r !== e && Bytes.placedBefore(pool, e, r))); };
  return clock.names.filter(before).length >= clock.names.length - clock.needed + 1;
}
// her closes: the key grants with no voice that end her list, each counted and standing among the blocks held
const closesOf = (who, pool) => pool.all().filter(k => Check.keyGrantOf(k, who) && Array.isArray(k.state.voices) && k.state.voices.length === 0 && Identity.counts(k, pool));
const closedIn = (person, pastSet, pool) => { try { const idf = Identity.identityFold(person, pool); return idf.keyMap.size > 0 && idf.standingAt(pastSet).voices.length === 0; } catch (e) { return false; } };
// the core: rowHoldsRaw(move, circle, pool, { within }) -> { holds, row, every_owner, at, hands: [{ id, block, parts, counts, why }], waiting }
function rowHoldsRaw(m, F, pool, opts = {}) {
  pool._inCircle = (pool._inCircle || 0) + 1; // a cycle read while a row is being read taints what asked (circles.md); cycles elsewhere are as they were
  try { return rowHoldsRaw0(m, F, pool, opts); } finally { pool._inCircle--; }
}
function rowHoldsRaw0(m, F, pool, opts = {}) {
  const C = pool.get(F);
  const none = { holds: false, row: null, every_owner: false, at: null, hands: [], waiting: [{ block: m.hash, on: 'hands' }] };
  if (!isFoundingCircle(C) || m.refs.as !== F || !pool.past(m.hash).has(F)) return none;
  const inW = h => !opts.within || opts.within.has(h);
  const eq = Identity.equivocated(pool);
  // the hands: the move itself, and each block that names it in refs.confirms
  const handBlocks = [m, ...pool.all().filter(x => x.hash !== m.hash && Check.asList(x.refs.confirms).includes(m.hash) && Basics.isStr(x.refs.author) && inW(x.hash))];
  const addBack = new Set(); for (const mm of [m, ...Check.asList(m.refs.confirms).map(h => pool.get(h)).filter(Boolean)]) for (const a of Check.asList(mm.refs.answers)) addBack.add(a);
  const cnM = circleNow(F, pool, pool.past(m.hash)), meter = cnM.meter;
  const clock = cnM.clocks ? Identity.clocksOf(cnM.clocks) : null;
  const hasPack = !!packOf(C);
  const hands = handBlocks.map(h => {
    let id = h.refs.author, fixed = null;
    if (h !== m && h.refs.as === F) id = F;
    else if (h !== m && h.refs.as !== undefined) id = h.refs.as;
    if (eq.has(h.hash)) fixed = 'pair';
    else if (!Identity.counts(h, pool)) fixed = 'not_voice';
    else if (id === F) fixed = 'not_voice';
    else if (h !== m && h.refs.as !== undefined && !rowHoldsMemo(h, h.refs.as, pool).holds) fixed = 'waiting';
    else if (!standsNoHands(h, pool).stands) fixed = 'waiting';
    let parts = null;
    if (hasPack) { const cp = circleParts(F, pool, pool.past(h.hash), addBack); if (!cp.not_shown && !cp.none) parts = id === F ? cp.unissued : partsOf(cp, id); }
    return { h, id, fixed, parts };
  });
  const rows = rowsFor(F, m, pool);
  const covering = rows.filter(Ri => Basics.isObj(Ri.R) && Basics.isObj(Ri.R.scope) && rowCovers(Ri, m, F, pool, meter));
  const gives = who => movesGivesTo(m, who, F, pool);
  // a hand's ends that x has seen: for a parts row, any draw of hers on the circle's parts signed after her hand (bar a draw the move takes up), and her close
  const drawsOnF = pool.all().filter(t => t.type === 'transfer' && t.state.status === undefined && Check.asList(t.refs.what).includes(F) && Identity.counts(t, pool));
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
    if (R.parts !== undefined) { if (!hd.parts || !Deals.fpos(hd.parts) || endedParts(hd, x)) return null; return hd.parts; }
    const hp = pool.past(hd.h.hash), xp = pool.past(x.hash);
    if (!rowNamed(R.to, F, pool, h => h === hd.h.hash || hp.has(h)).includes(hd.id)) return null;
    if (!rowNamed(R.to, F, pool, h => h === x.hash || xp.has(h) || h === hd.h.hash || hp.has(h)).includes(hd.id) || closeSeen(hd, x)) return null;
    return { n: 1n, d: 1n };
  };
  const weighAll = (hd, x) => (live(hd) && hd.id !== F && hd.parts && Deals.fpos(hd.parts) && !endedParts(hd, x) ? hd.parts : null);
  // every part persons own: the pack, less the unissued parts the meter's receipt of the move states where any are unissued in its past
  let need = null;
  { const cp = hasPack ? circleParts(F, pool, pool.past(m.hash), addBack) : null;
    if (cp && cp.map) { need = Deals.dec(C.state.pack.value); if (Deals.fpos(cp.unissuedTitle)) { const s = unissuedStated(m, meter, pool); need = s === null ? null : Deals.fsub(need, s); } } }
  // an id counts once: of her hands, the one that weighs most (ties: the lowest block hash) counts; her others add nothing
  const best = (pick, present) => { const by = new Map(); for (const hd of present) { const w = pick(hd); if (!w || !Deals.fpos(w)) continue; const o = by.get(hd.id); if (!o || Deals.fcmp(w, o.w) > 0 || (Deals.fcmp(w, o.w) === 0 && hd.h.hash < o.hd.h.hash)) by.set(hd.id, { hd, w }); } return by; };
  const evalAt = x => {
    const xp = pool.past(x.hash), present = hands.filter(hd => hd.h.hash === x.hash || xp.has(hd.h.hash));
    for (const Ri of covering) {
      const by = best(hd => weigh(Ri, hd, x), present);
      const ok = Ri.R.parts !== undefined ? Deals.fcmp(Deals.fsumF([...by.values()].map(v => v.w)), Deals.dec(String(Ri.R.parts))) >= 0 : by.size >= Ri.R.needed;
      if (ok) return { row: Ri.i, every: false };
    }
    if (need !== null && Deals.fpos(need)) { const by = best(hd => weighAll(hd, x), present); if (Deals.fcmp(Deals.fsumF([...by.values()].map(v => v.w)), need) >= 0) return { row: null, every: true }; }
    return null;
  };
  // where it holds: the move or a confirm of it, the fewest blocks in its past first, ties by hash
  const cands = hands.map(hd => hd.h).filter(x => inW(x.hash)).sort((a, b) => pool.past(a.hash).size - pool.past(b.hash).size || Basics.cmp(a.hash, b.hash));
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
    return { id: hd.id, block: hd.h.hash, parts: hasPack && hd.parts ? { value: Deals.fPrint(hd.parts), unit: 'part' } : null, counts: c, why: c ? null : hd.fixed || 'not_voice' };
  }).sort((a, b) => Basics.cmp(a.block, b.block));
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
// the one answer: does a row hold for this block `as` its circle? null for a block that is not `as` a circle. A version holds by an `actor` row of the
// founding block (rowsFor) or every owner, and only where what it updates is the founding block or a version that holds
function circleHolds(b, pool) {
  if (b.refs.as === undefined) return null;
  const F = b.refs.as;
  const r = rowHoldsMemo(b, F, pool);
  if (!(isCircleBlock(b) && Basics.isStr(b.refs.updates)) || !r.holds) return r;
  const par = b.refs.updates === F || (() => { const p = pool.get(b.refs.updates); return !!p && isCircleBlock(p) && p.refs.as === F && Basics.isStr(p.refs.updates) && circleHolds(p, pool).holds; })();
  return par ? r : { ...r, holds: false, row: null, every_owner: false, at: null, waiting: [{ block: b.hash, on: 'hands' }] };
}
// authority.md, Ending: a word `as` a circle is ended by a stop of its author while her hand could still count there
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
  const pool = Check.poolOf(within ? [...Check.poolOf(blocks).all().filter(x => x.hash !== within.hash), within] : blocks);
  const C = pool.get(circleId);
  if (!isFoundingCircle(C)) return null;
  const past = within ? pool.past(within.hash) : null;
  if (past && !past.has(circleId)) return null;
  const cn = circleNow(circleId, pool, past);
  const base = { founder: C.refs.author === undefined ? null : C.refs.author, pack: packOf(C) ? { ...packOf(C) } : null, rules: cn.rows, clocks: cn.clocks, meter: cn.meter };
  if (!packOf(C)) return { ...base, owners: { not_said: true }, unissued: null };
  const cp = circleParts(circleId, pool, past);
  if (cp.not_shown) return { not_shown: true, lacks: cp.lacks };
  // no_person: an owner that is a circle whose owners, followed through, are only circles and come back round
  const noPerson = (id, seen) => {
    if (!isFoundingCircle(pool.get(id))) return false;
    if (seen.includes(id)) return true;
    const c2 = circleParts(id, pool, past);
    if (!c2.title) return false;
    const others = [...c2.title.entries()].filter(([, a]) => Deals.fpos(a)).map(([o]) => o);
    return others.length > 0 && others.every(o => noPerson(o, [...seen, id]));
  };
  const owners = [...cp.map.entries()].filter(([, a]) => Deals.fpos(a)).map(([o, a]) => ({ owner: o, amount: { value: Deals.fPrint(a), unit: 'part' }, no_person: noPerson(o, [circleId]) })).sort((a, b) => Basics.cmp(a.owner, b.owner));
  return { ...base, owners, unissued: { value: Deals.fPrint(cp.unissuedTitle), unit: 'part' } };
}
// row_holds(block, held): the circle's judgement of a block signed `as` it; null where refs.as names no founding circle held
function rowHoldsOp(block, blocks) {
  if (!Basics.isObj(block) || !Basics.isObj(block.refs) || !Basics.isStr(block.refs.as)) return null;
  const pool = Bytes.readWith(blocks, block);
  const b = pool.get(block.hash);
  const F = block.refs.as;
  if (!isFoundingCircle(pool.get(F))) return null;
  const r = b ? circleHolds(b, pool) : null;
  // a block the reader lacks, or has and cannot read, holds by no row
  if (!r) return { circle: F, holds: false, row: null, every_owner: false, at: null, hands: [], waiting: [{ block: block.hash, on: 'hands' }], listed: [] };
  return { circle: F, holds: r.holds, row: r.row, every_owner: r.every_owner, at: r.at, hands: r.hands, waiting: r.waiting, listed: listedFor(b, F, pool) };
}
// the listing (a reading): where the move gives to an owner (an id owning parts by title), a tool of hers, or a circle in which her hand could count: the promises signed `as`
// the circle that hold, are not in the move's causal past, are not the move, and whose stage is not done, stopped or declined. Nothing is refused for it and no sum is run.
function listedFor(m, F, pool) {
  if (m.refs.as !== F) return [];
  const past = pool.past(m.hash);
  const cp = circleParts(F, pool, past);
  const who = cp.title ? [...cp.title.entries()].filter(([, a]) => Deals.fpos(a)).map(([id]) => id) : [];
  if (!who.some(s => movesGivesTo(m, s, F, pool))) return [];
  const words = pool.all().filter(w => w.type === 'promise' && w.refs.as === F && w.state.status === undefined && w.refs.answers === undefined && w.hash !== m.hash && !past.has(w.hash) && Identity.counts(w, pool) && rowHoldsMemo(w, F, pool).holds);
  return words.filter(w => { const st = Deals.promiseStage(w, pool); return st && !st.not_shown && !['done', 'stopped', 'declined'].includes(st.stage); }).map(w => w.hash).sort();
}
// ways_in(circle, held), a reading: { circle, rows: [{ row, least }], every_owner: { least } | null }; { not_shown, lacks }; null where the circle is not held
function waysIn(circleId, blocks) {
  const pool = Check.poolOf(blocks);
  const C = pool.get(circleId);
  if (!isFoundingCircle(C)) return null;
  const cn = circleNow(circleId, pool, null);
  const cp = circleParts(circleId, pool, null);
  if (cp.not_shown) return { not_shown: true, lacks: cp.lacks };
  const persons = cp.title ? [...cp.title.entries()].filter(([, a]) => Deals.fpos(a)).map(([id]) => [id, partsOf(cp, id)]) : [];
  const every = cp.title && !(Deals.fpos(cp.unissuedTitle) && cn.meter === null) && persons.length ? persons.length : null;
  const rows = cn.rows.map((R, i) => {
    let least = null;
    if (Basics.isObj(R) && R.parts !== undefined) { const free = persons.map(([, a]) => a).sort((x, y) => Deals.fcmp(y, x)); let sum = Deals.F0; for (let k = 0; k < free.length; k++) { sum = Deals.fadd(sum, free[k]); if (Deals.fcmp(sum, Deals.dec(String(R.parts))) >= 0) { least = k + 1; break; } } }
    else if (Basics.isObj(R) && R.to !== undefined && Number.isInteger(R.needed)) least = rowNamed(R.to, circleId, pool, () => true).length >= R.needed ? R.needed : null;
    if (least !== null && every !== null) least = Math.min(least, every);
    return { row: i, least };
  });
  return { circle: circleId, rows, every_owner: every === null ? null : { least: every } };
}
// circle_versions: { circle, versions: [{ version, updates, author, holds, hands }], now }: versions only, sorted; now the standing version's id, else the founding block's
function circleVersions(circleId, blocks) {
  const pool = Check.poolOf(blocks);
  const C = pool.get(circleId);
  if (!isFoundingCircle(C)) return null;
  const vs = circleVersionsOf(circleId, pool).map(v => { const r = circleHolds(v, pool); return { version: v.hash, updates: v.refs.updates, author: v.refs.author, holds: r.holds, hands: [...new Set(r.hands.filter(h => h.counts).map(h => h.id))].sort() }; });
  const cn = circleNow(circleId, pool, null);
  return { circle: circleId, versions: vs, now: cn.version === null ? circleId : cn.version };
}
// members_then(block, recipient): the owners of a circle's parts (by title: parts held for a sale count for the seller until the receiver's yes) in the circle fold of the block's
// causal past; a name that is not a circle names no one
function membersThen(block, recipient, blocks) {
  if (!Basics.isStr(recipient)) return [];
  const pool = Bytes.readWith(blocks, block);
  const F = recipient;
  if (!isFoundingCircle(pool.get(F))) return [];
  const past = pool.before(block.hash);
  if (!past.has(F)) return [];
  const cp = circleParts(F, pool, past);
  if (!cp.title) return [];
  return [...cp.title.entries()].filter(([, a]) => Deals.fpos(a)).map(([id]) => id).sort();
}
// circle_key (profiles/rekeys.md): key grants `as` the circle that a row holds for
function circleKey(circleId, blocks) {
  const pool = Check.poolOf(blocks);
  const C = pool.get(circleId);
  if (!isFoundingCircle(C)) return { epoch: 0, keys: [], grants: [] }; // a circle the folds cannot read has no key
  const rekeys = pool.all().filter(b => b.type === 'grant' && b.state.kind === 'key' && b.state.epoch !== undefined && b.refs.subject === circleId && b.refs.as === circleId && Identity.counts(b, pool));
  const ok = new Set();
  for (const r of rekeys.sort((a, b) => a.state.epoch - b.state.epoch)) {
    if (!circleHolds(r, pool).holds) continue;
    const n = r.state.epoch;
    const prevOk = n === 1 ? Check.asList(r.refs.after).includes(circleId) : Check.asList(r.refs.after).some(h => ok.has(h) && pool.get(h).state.epoch === n - 1);
    if (prevOk) ok.add(r.hash);
  }
  const counted = rekeys.filter(r => ok.has(r.hash));
  const epoch = counted.length ? Math.max(...counted.map(r => r.state.epoch)) : 0;
  const top = counted.filter(r => r.state.epoch === epoch);
  const keys = (epoch === 0 ? [C.state.public_key_encrypt] : top.map(r => r.state.public_key_encrypt)).filter(Boolean).sort();
  return { epoch, keys, grants: top.map(r => r.hash).sort() };
}
// counted_in (profiles/ballots.md)
const countedIn = (result, commitment, counter) => result.refs.author === counter && Check.asList(result.state.counted).includes(commitment);
Object.assign(module.exports, { isFoundingCircle, packOf, rowShapeOk, circleNow, circleParts, handCouldCount, widerThanRow, rowCovers, circleHolds, stillHolds, circleHoldsWithin, mayActAsIn, circleFold, circleState, rowHoldsOp, waysIn, circleVersions, membersThen, circleKey, countedIn });
