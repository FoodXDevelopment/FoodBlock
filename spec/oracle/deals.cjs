'use strict';
// The oracle's part for deals (promises.md; folds.md, A promise's stage): amounts, a promise's stage, claims and a pot.
const Basics = require('./basics.cjs');
const Bytes = require('./bytes.cjs');
const Check = require('./check.cjs');
const Circles = require('./circles.cjs');
const Consent = require('./consent.cjs');
const Grants = require('./grants.cjs');
const Identity = require('./identity.cjs');
const Things = require('./things.cjs');
// ================================================================ amounts (encoding.md, Shapes; folds.md, What each fold returns)
// An amount is { value, unit } or { value, unit, of }. Every sum is an exact fraction inside the oracle and one printed form outside it (fText). Nothing is rounded.
// a message that names a judge (promises.md, A new term both sides signed): an observe of kind message `for` the deal or claim, stating `judge`, one id
const namesJudge = (g, subject) => g.type === 'observe' && g.state.kind === 'message' && Check.asList(g.refs.for).includes(subject) && Basics.isStr(g.state.judge) && Check.RX.id.test(g.state.judge);

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
const decCmp = (x, y) => (Basics.isStr(x) && Basics.isStr(y) && Check.RX.decimal.test(x) && Check.RX.decimal.test(y) ? fcmp(dec(x), dec(y)) : NaN);
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
const sameKind = (a, b) => Basics.isObj(a) && Basics.isObj(b) && a.unit === b.unit && ((a.of === undefined || a.of === null) ? (b.of === undefined || b.of === null) : a.of === b.of);
// a figure a fold prints is the exact value of signed numbers: the shortest decimal text, of any length, where it has one; else `n/d`, two whole numbers in lowest terms, which no block may sign
const fPrint = f => { const t = fText(f); if (t !== null) return t; const r = fnorm(f); return r.n + '/' + r.d; };
const amtOut = (f, kind) => { const t = fPrint(f); if (t === null || !kind) return null; const o = { value: t, unit: kind.unit }; if (kind.of !== undefined && kind.of !== null) o.of = kind.of; return o; };
const isAmount = a => Basics.isObj(a) && Check.shapeOf(a) === 'amount' && !Check.amountProblem(a);
// what a price comes to (promises.md, Terms): a flat price is the total for the whole; { amount, per } is amount.value times the quantity over per.value, exact, the quantity
// of per's kind (nothing is converted); a per of zero, or a quotient with no decimal form, has no total. { f, kind } or null.
function totalOf(price, qty) {
  if (!Basics.isObj(price) || 'figure' in price) return null;
  if (!Check.perUnit(price)) return isAmount(price) ? { f: dec(price.value), kind: kindOf(price) } : null;
  const a = price.amount, per = price.per;
  if (!isAmount(a) || !isAmount(per) || !isAmount(qty) || !sameKind(qty, per)) return null;
  const p = dec(per.value), q = dec(qty.value);
  if (p.n === 0n) return null;
  // no fold rounds and no test divides in a price test; a total that has no finite decimal form prints as `n/d` (never null for that reason)
  const f = fnorm(fdiv(fmul(dec(a.value), q), p));
  return { f, kind: kindOf(a) };
}
// each priced line of the terms (or the whole price at `chosen`) with what it comes to; qtyFor(i, q) may restate a line's quantity
// each priced line at its quantity chosen (`chosen` an answer's lines, [{ id, quantity }]); `qtyFor` reads what is priced of line i
const pricedParts = (terms, chosen, qtyFor = (i, q) => q) => Check.linesOf(terms).map((l, i) => ({ price: l.price, qty: qtyFor(i, Check.quantityOf(l, Array.isArray(chosen) ? chosen : undefined)) }))
  .filter(x => Basics.isObj(x.price)).map(x => totalOf(x.price, x.qty));
// the parts added: amounts of two kinds are never added (null), nor is a part with no total
function sumParts(parts) {
  if (!parts.length || parts.some(x => x === null)) return null;
  if (parts.some(x => !sameKind(x.kind, parts[0].kind))) return null;
  return { f: fsumF(parts.map(x => x.f)), kind: parts[0].kind };
}
// what a promise's terms come to (folds.md, A promise's stage): each priced line at its quantity chosen (else its own); { f, kind } or null
// `step`: under a price, the least payable amount its signers take, an amount in the price's unit. The total is the least whole number of steps at or above the exact figure. With no `step`, the total is exact.
// a step in another unit than the price's, or at zero, is read as no step; with lines, the step rounds the sum (the text does not say; read so)
function stepUp(r, step) {
  if (!r || !isAmount(step) || step.unit !== r.kind.unit || !(step.of === undefined || step.of === (r.kind.of === null ? undefined : r.kind.of))) return r;
  const st = dec(step.value);
  if (!st || !fpos(st)) return r;
  const q = fnorm(fdiv(r.f, st));
  const n = q.n / q.d + (q.n % q.d > 0n ? 1n : 0n);
  return { f: fnorm(fmul({ n, d: 1n }, st)), kind: r.kind };
}
function termsTotalF(terms, chosen) {
  const t = Basics.isObj(terms) ? terms : {};
  return stepUp(sumParts(pricedParts(t, chosen)), t.step);
}
function termsTotal(terms, chosen) { const r = termsTotalF(terms, chosen); return r ? amtOut(r.f, r.kind) : null; }

// ================================================================ a promise's stage (folds.md, promises.md)
// an accept that is not in time binds by a relier's block (blocks.md, Relier): a counted block of anyone but its signer that names it
// (in any ref but `author`, `prev`, `key` and `after`), other than a decline or a stop of it
function reliedOn(a, pool) {
  const s = Things.speakerOf(a, pool);
  return pool.all().some(x => x.hash !== a.hash && x.type !== undefined && !((x.state.status === 'declined' || x.state.status === 'stopped') && Check.asList(x.refs.answers).includes(a.hash)) &&
    Object.entries(x.refs).some(([k, v]) => !['author', 'prev', 'key', 'after'].includes(k) && Check.asList(v).includes(a.hash)) && Identity.counts(x, pool) && Things.speakerOf(x, pool) !== s);
}
// the order of stages, lowest first (folds.md, A promise's stage): offered or asked, declined, stopped (before), accepted, underway, stopped (onward), done, reversed; only the bench lowers it
const STAGE_RANK = o => (o.stage === 'stopped' ? (o.stop === 'onward' ? 5 : 2) : { offered: 0, asked: 0, expired: 0, declined: 1, accepted: 3, underway: 4, done: 6, reversed: 7 }[o.stage]);
function promiseStage(firstIn, poolIn, opts) {
  try {
    const r = promiseStageCore(firstIn, poolIn, opts);
    // accepts that bind and do not see each other cross: each binds, the deal is read once under each (`per_accept`), and the stage is the furthest of them
    if (r && !r.not_shown && r.crossed.length > 1 && !(opts && opts.only)) {
      const per = r.crossed.map(h => ({ h, st: promiseStageCore(firstIn, poolIn, { ...(opts || {}), only: h }) }));
      const best = per.slice().sort((x, y) => STAGE_RANK(y.st) - STAGE_RANK(x.st) || Basics.cmp(x.h, y.h))[0].st;
      const out = { ...best, crossed: r.crossed, forks: r.forks, requests: r.requests, per_accept: per.map(x => ({ accept: x.h, stage: x.st.stage, paid: x.st.paid, uncovered: x.st.uncovered, lines: x.st.lines })).sort((x, y) => Basics.cmp(x.accept, y.accept)) };
      if (best.paidUp !== undefined) Object.defineProperty(out, 'paidUp', { value: best.paidUp, enumerable: false });
      return out;
    }
    return r;
  } catch (e) { if (e && e.notShown) return { not_shown: true, lacks: e.lacks }; throw e; }
}
function promiseStageCore(firstIn, poolIn, opts) {
  // the first promise is read with the blocks given; one that rests on blocks not given is not read yet: no stage (folds.md)
  const pool = new Check.Pool(typeof firstIn === 'string' ? Check.poolOf(poolIn).all() : [firstIn, ...Check.poolOf(poolIn).all()]);
  const P = pool.get(typeof firstIn === 'string' ? firstIn : firstIn.hash);
  if (!P) return null;
  const cover = b => {
    if (b.refs.under === undefined) return null;
    const g = pool.get(b.refs.under);
    // a grant that is not live, or not made for the block's author, is no grant: the block acts under none (folds.md, Who a block speaks for)
    if (!g || g.type !== 'grant' || !Grants.grantLive(g, pool, new Set(), b) || !Grants.receives(g, b)) return null;
    // it is covered when it passes the door's whole authority test (authority.md)
    return { principal: Things.principalOf(g, pool), covered: !Grants.whyNotUnder(b, pool).length };
  };
  const whoMemo = new Map();
  const who = b => { if (!whoMemo.has(b.hash)) whoMemo.set(b.hash, Things.speakerOf(b, pool)); return whoMemo.get(b.hash); };
  // a promise is a quote request unless the grant it acts under covers its type (promises.md, invariant 22). A promise under no grant it acts under is
  // its author's own word, whoever the author is (a person, a machine): it speaks for its author and binds them alone.
  const quoteOffer = b => { const c = cover(b); return c ? !c.covered : false; };
  // an accept: a promise that says accepted, or her AI's reading "accepted under rule R" when R is her live grant and covers it (promises.md, Answers)
  const isAcc = b => (b.type === 'promise' && b.state.status === 'accepted') || (Things.isMachineAccept(b, pool) && !!cover(b) && cover(b).covered);
  // an allocation starts its own deal (promises.md, Who may bind): the offerer's accepted answer to a request on an open offer. It is read with
  // the allocation as head and the offer as root; an allocation the open offer does not bind has no deal.
  // what an open offer caps its quantity at: the largest of a range, else the amount
  const alloc = (() => {
    if (P.type !== 'promise' || P.state.status !== 'accepted' || P.refs.answers === undefined) return null;
    // the request: an accept of the open offer, or a counter to it (the offerer's accept of a counter to her open offer binds a deal
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
  // the open offer's lines, and the unit a line's quantity (an amount or a range) is in
  const offerLines = Check.linesOf(Basics.termsOf(Q));
  const lineUnit = q => (Basics.isObj(q) ? (Basics.isStr(q.unit) ? q.unit : Basics.isObj(q.min) ? q.min.unit : Basics.isObj(q.max) ? q.max.unit : undefined) : undefined);
  const out = { stage: null, stop: null, from: null, by: null, offer: Q.hash, accept: null, sides: { from: Q.refs.from === undefined ? null : Q.refs.from, to: Q.refs.to === undefined ? null : Q.refs.to }, takers: [], forks: [], lines: [], total: null, paid: null, stopped: [], disputed: [], due: null, paid_at: null, occurrences: [], judge_ties: [], crossed: [], per_accept: [], requests: [], waiting: [], bench: 'none', uncovered: { from: [], to: null }, unanswered: [], over_allocated: false, to_come: null, to_come_on: [], received_at: [], moved: [], price_fixed: null };
  // a side that names a thing is its owner where each block stands: the ownership fold of that block's causal past (promises.md, Bearer), so an
  // accept binds the holder that signed it, and a note passed on after it was redeemed binds no one again. An allocation's open side is its taker.
  const isThing = r => { const t = r !== undefined && pool.get(r); return !!t && t.type === 'thing'; };
  const ownerMemo = new Map();
  const sideAt = (key, b) => {
    const r = Q.refs[key];
    if (r === undefined || r === '') return alloc ? alloc.t.who : undefined;
    if (!isThing(r)) return r;
    const k = r + '|' + b.hash;
    if (!ownerMemo.has(k)) ownerMemo.set(k, Things.ownershipFold(r, pool, pool.past(b.hash)).owner);
    return ownerMemo.get(k);
  };
  // the side a block speaks for, where it stands: 'from', 'to' or null
  const sideOfB = b => { const w = who(b); if (!Basics.isStr(w)) return null; return w === sideAt('from', b) ? 'from' : w === sideAt('to', b) ? 'to' : null; };
  // a fork voids what the forker claims, never what they owe (folds.md, A fork is a burden): a block of a fork (one of the pair, or a later block of that
  // key) still counts in a deal where it binds its signer or another's word stands on it; its stops and declines, which would free its signer by
  // their word alone, count for nothing, and so do its confirms and defeats (read below only where they count)
  const all = pool.all().filter(b => Identity.binds(b, pool));
  // the head too: a first promise (or allocation) whose key does not speak for its author is no word of theirs, to come or claimed (folds.md,
  // A fork is a burden): it has no stage
  if (!all.includes(P)) return null;
  // the deal: P, and every block that names P in for or answers a block in the deal. A promise with no answers is a new deal.
  const deal = new Map([[P.hash, P]]);
  for (let grew = true; grew;) {
    grew = false;
    for (const b of all) {
      if (deal.has(b.hash)) continue;
      const names = Check.asList(b.refs.for).includes(P.hash) && !(b.type === 'promise' && b.refs.answers === undefined);
      if (names || (b.refs.answers !== undefined && deal.has(b.refs.answers)) || (b.refs.updates !== undefined && deal.has(b.refs.updates))) { deal.set(b.hash, b); grew = true; }
    }
  }
  // an updates of a promise is its author's stop (any other is refused, so no fold reads one: terms are fixed once written, promises.md):
  // it counts only when it speaks for the one the block it updates speaks for (the other side stops by answers)
  const D = [...deal.values()].filter(b => !(b.type === 'promise' && b.refs.updates !== undefined && b.refs.answers === undefined &&
    (!pool.get(b.refs.updates) || who(b) === null || who(b) !== who(pool.get(b.refs.updates)))));
  if (!sideOfB(Q)) return null; // a first promise that speaks for neither side is nobody's promise: no stage
  const open = !alloc && (Q.refs.from === undefined || Q.refs.to === undefined);
  // her plan: both refs name its signer (a note its issuer still holds is a promise to its holder, not her plan)
  const self = !alloc && Basics.isStr(Q.refs.from) && !isThing(Q.refs.from) && Q.refs.from === Q.refs.to && Q.refs.from === who(Q);
  // ---- the live offers: P, or the latest counters between the same two sides, each signed by the side that did not sign the offer it answers
  // (not on an open offer). Two counters that cross both stand.
  // the live offers among the counters vis lets in (every one given, or those in an accept's causal past: an accept binds the offer live where it stands)
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
  const onwardFirst = Check.earliest(onward, pool)[0];
  const declines = D.filter(b => (b.type === 'promise' && b.state.status === 'declined') || Things.isDeclineReading(b));
  // a withdrawal stops the offer it names (its updates or answers): an accept of that offer binds unless the withdrawal is in its causal past
  const stopsOne = (s, h) => s.refs.updates === h || s.refs.answers === h;
  const seenStop = a => stopsBefore.some(s => stopsOne(s, a.refs.answers) && pool.sees(a.hash, s.hash));
  // an accept keeps to the offer (invariant 12): for each line, where its quantity is a range a quantity in its unit inside it; else none, or the
  // same; and it names no line the offer does not state
  const fits = (a, o) => {
    const offered = Check.linesOf(Basics.termsOf(o)), chosen = Array.isArray(Basics.termsOf(a).lines) ? Basics.termsOf(a).lines : [];
    if (chosen.some(c => !Basics.isObj(c) || !offered.some(l => l.id !== undefined && l.id === c.id))) return false;
    return offered.every(l => {
      const q = l.quantity, c = chosen.find(y => y.id === l.id), x = c ? c.quantity : undefined;
      if (!Basics.isObj(q)) return x === undefined; // a line with no quantity is accepted with none: an accept never adds one
      if ('min' in q || 'max' in q) {
        const unit = (q.min || q.max).unit;
        if (!Basics.isObj(x) || x.unit !== unit || !dec(x.value)) return false;
        return (q.min === undefined || (q.min.unit === unit && decCmp(q.min.value, x.value) <= 0)) && (q.max === undefined || (q.max.unit === unit && decCmp(q.max.value, x.value) >= 0));
      }
      return x === undefined || (Basics.isObj(x) && x.unit === q.unit && decCmp(x.value, q.value) === 0);
    });
  };

  // ---- the bench (promises.md, Disputes): who rules
  // a judge named late (promises.md, A new term both sides signed): a side's observe of kind message for the deal stating `judge`, which the other side
  // answers accepted; both signed, so she sits on the bench after the names the grounds give. Neither side alone ends it.
  // a judge named after the deal bound counts on its bench only where each side, and every holder of what either side has to come, signed or accepted the message
  let holdersFn = () => [];
  const judgesFor = (sides, subject = P.hash, bound = null) => {
    const sideOf = b => sides.find(x => who(b) === x);
    const accepts = (g, ok) => pool.all().some(a => a.type === 'observe' && a.state.status === 'accepted' && Check.asList(a.refs.answers).includes(g.hash) && Identity.counts(a, pool) && ok(a));
    return [...new Set(pool.all().filter(g => namesJudge(g, subject) && Identity.counts(g, pool) && sideOf(g) !== undefined &&
      accepts(g, a => sideOf(a) !== undefined && sideOf(a) !== sideOf(g)) &&
      (!bound || pool.sees(bound.hash, g.hash) || holdersFn().filter(h => !sides.includes(h)).every(h => who(g) === h || accepts(g, a => who(a) === h)))).map(g => g.state.judge))].sort();
  };
  // the judges the bound offer's schema names in its grounds (`grounds.bench.names`), in order, then the judges both sides named; less a side, or a role inside a side's
  // circle. A block of a side's, or one that speaks for a side, rules on nothing (invariant 13).
  const benchOf = (schema, sides, bound, subjects = [P.hash]) => {
    const grounds = schema && Basics.isObj(schema.state.grounds) ? schema.state.grounds : {};
    // a name that is a side adds nothing; a role inside a side's circle stays, its tie shown
    const notSide = w => Basics.isStr(w) && !sides.includes(w);
    const bench = Basics.isObj(grounds.bench) ? grounds.bench : {};
    const names = [...new Set([...Check.asList(bench.names).filter(Basics.isStr), ...subjects.flatMap(x => judgesFor(sides, x, bound))].filter(notSide))];
    // no default in the protocol: the number the schema states; one name needs none; more than one and no number stated is
    // no number (null), and nothing they say rules until both sides sign one
    const needed = Number.isSafeInteger(bench.needed) && bench.needed > 0 ? bench.needed : names.length <= 1 ? 1 : null;
    const wait = Basics.isStr(grounds.wait) && Check.parseDur(grounds.wait) ? grounds.wait : null;
    // a side alone never rules: not its own block, nor a block that speaks for a side. A judge both sides signed counts even when tied to a side
    // (a member of a side's circle): the tie is shown in judge_ties (folds.md, Defeated blocks)
    const sided = o => sides.includes(o.refs.author) || sides.includes(who(o));
    // each name's ties to a side, from the blocks given: a member of a side's circle
    const ties = sideList => {
      const out = [];
      for (const n of names) for (const [side, x] of sideList) {
        if (!Basics.isStr(x)) continue;
        const c = Circles.circleState(x, pool);
        if (c && Array.isArray(c.owners) && c.owners.some(o => o.owner === n)) out.push({ judge: n, side, how: 'member' }); // folds.md: `how` `member`, the name owns parts of the side's circle
      }
      const key = t => [t.judge, t.side, t.how];
      return out.sort((a, b) => { const p = key(a), q = key(b); for (let i = 0; i < 3; i++) if (p[i] !== q[i]) return Basics.cmp(p[i], q[i]); return 0; });
    };
    const holdsName = (o, n) => Identity.counts(o, pool) && n === o.refs.author && !sided(o);
    const named = o => names.some(n => holdsName(o, n));
    // a name's words on a block: her `confirms` and `defeats` that count for her place (holdsName). Her verdict: false where a `defeats` of hers has no `confirms` of hers after it, else true where she confirmed, else null.
    const wordsOf = (n, h) => pool.all().filter(c => (Check.asList(c.refs.confirms).includes(h) || Check.asList(c.refs.defeats).includes(h)) && holdsName(c, n));
    const verdict = (words, h) => {
      const yes = words.filter(c => Check.asList(c.refs.confirms).includes(h)), no = words.filter(c => Check.asList(c.refs.defeats).includes(h));
      if (no.some(d => !yes.some(c => pool.sees(c.hash, d.hash)))) return false;
      return yes.length ? true : null;
    };
    const voice = (n, h) => verdict(wordsOf(n, h), h);
    // A backup judge (promises.md, Disputes): with `grounds.wait` the names are a chain, each the backup of the one before. A later name's turn begins where `needed` lines each hold a cutoff (a span no shorter than the wait, running from that line's receipt of a side's dispute of the block) (the text does not say; read so)
    // with no word of an earlier name received before it: the lines of the clocks the grounds name that no side keeps (`grounds.clocks`), or the earlier name's own line. A side's own clock starts no turn against the other side.
    const gclocks = Identity.clocksOf(grounds.clocks);
    const waitMs = wait ? Check.spanMs(wait) : null;
    const startsFor = (i, h) => {
      // a side's dispute: its counted `defeats` of a block that speaks for the other side (folds.md, Defeated blocks); the bench's turn runs from it
      const otherSides = o => Check.asList(o.refs.defeats).some(t => { const x = pool.get(t); return !!x && sides.includes(who(x)) && who(x) !== who(o); });
      const disputes = pool.all().filter(o => Check.asList(o.refs.defeats).length && Identity.counts(o, pool) && sides.includes(who(o)) && otherSides(o)).map(o => o.hash), starts = [];
      const lineStarts = (name) => {
        const owner = (x => (x && Basics.isStr(x.refs.author) ? x.refs.author : name))(pool.get(name));
        if (sides.includes(owner)) return null;
        const rs = Bytes.receiptsOn(name, h, pool).filter(() => false).concat(Bytes.clockLine(name, pool).filter(o => o.type === 'observe' && o.state.kind === 'receipt' && Check.asList(o.refs.derives_from).some(x => disputes.includes(x))));
        for (const r of rs) for (const c of Bytes.clockLine(name, pool).filter(o => o.type === 'observe' && o.state.kind === 'cutoff' && Check.asList(o.refs.derives_from).includes(r.hash) && Basics.isStr(o.state.when) && Check.spanMs(o.state.when) !== null && Check.spanMs(o.state.when) >= waitMs)) {
          const earlierWords = names.slice(0, i).flatMap(e => wordsOf(e, h));
          if (!earlierWords.some(w => Bytes.receiptsOn(name, w.hash, pool).some(x => Bytes.placedBefore(pool, x, c)))) return c;
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
      return Check.quorum(by(false), needed) ? false : Check.quorum(by(true), needed) ? true : null;
    };
    return { names, needed, wait, clocks: gclocks, holdsName, named, voice, turn, ruling, ties };
  };
  // ---- binding accepts
  let accept = null, takers = [], forks = [], freedBy = () => false; // freedBy: an allocation stopped onward, its quantity freed
  const requestsOut = []; let crossedOut = []; let spotAccept = null;
  // forks: blocks of a pair in the deal (one key, one `prev` or one `seq`): a pair never frees its signer
  const pairsInDeal = () => { const ds = new Set(D.map(x => x.hash)); return [...new Set(Identity.forkPairs(pool).flat().filter(h => ds.has(h)))].sort(); };
  // a counter's deal has the counter's own terms, whole
  if (alloc) { accept = P; takers = [alloc.t]; if (alloc.R.state.status === undefined) live = alloc.R; }
  else if (self) { /* her plan binds no one: it has no accept */ }
  else if (!open) {
    // an answer binds the live offer it answers when it stands and its open points are closed; until then it is a request, listed in `requests` with what is open: `when`, `whose`. (the text does not say; read so)
    // A decline ends a standing word for its signer: an accept that has her own side's decline of that word in its causal past binds nothing. A later decline of an accept reaches nothing that binds.
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
        // a judge's ruling reaches the accept too (promises.md, Disputes): an accept the deal's judge defeats binds nothing
        { const sides = ['from', 'to'].map(k => sideAt(k, a)).filter(Basics.isStr); if (benchOf(o.refs.schema && pool.get(o.refs.schema), sides, a).ruling(a.hash) === false) continue; }
        const open = [];
        // WHEN, if the offer carries `expires` : with a clock, when `needed` lines received the accept before their cutoff through `expires`; with none, an accept is in time only by its own `at`, before `expires`; one that is not in time binds only by the offerer's own later block
        // that says yes to it (her `accepted` answer to it, or a block that performs the deal: a transfer `for` it, or her accepted answer to one), or a relier's counted block (a third person's) that has it in its past; a stop,
        // a decline, or her block that only has it in its past binds her to nothing (blocks.md, Time). A receipt or a date of the offerer's side is his word, read against him alone.
        const exp = Basics.termsOf(o).expires;
        if (exp !== undefined) {
          const ks = Identity.clocksOf(Basics.termsOf(o).clocks);
          const inTime = ks !== null ? (Basics.isStr(exp) && Bytes.inTimeByClock(a.hash, ks, pool, exp)) : (Basics.isStr(exp) && Basics.isStr(a.state.at) && a.state.at < exp);
          const dealIds = [P.hash, o.hash], forDeal = t => !!t && t.type === 'transfer' && t.state.status === undefined && Check.asList(t.refs.for).some(f => dealIds.includes(f));
          const actedOn = D.some(x => x !== a && sideOfB(x) === oSide && pool.sees(x.hash, a.hash) && ((x.state.status === 'accepted' && (Check.asList(x.refs.answers).includes(a.hash) || forDeal(pool.get(Check.asList(x.refs.answers)[0])))) || forDeal(x)));
          const relied = reliedOn(a, pool);
          if (!(inTime || actedOn || relied)) open.push('when');
        }
        // WHOSE, if the answer or the offer is waiting (a key with a reach, a grant whose end has not been passed, a word not yet signed twice): when it stands
        { const sa = Identity.standsOf(a, pool), so = Identity.standsOf(o, pool); if ((!sa.stands && sa.waiting.length) || (!so.stands && so.waiting.length)) open.push('whose'); }
        // an accept that does not bind and that the offerer declined, on an offer with `expires`, is ended: no longer a request
        const ended = exp !== undefined && D.some(x => x.state.status === 'declined' && x.refs.answers === a.hash && sideOfB(x) === oSide);
        if (open.length) { if (!ended) requestsOut.push({ block: a.hash, open: open.sort() }); continue; }
        if (!cands.includes(a)) cands.push(a);
      }
    }
    // each binds; accepts of one deal that bind and do not see each other CROSS (the deal is read once under each, `per_accept`); the stage is the furthest of them (the text does not say; read so)
    let firsts = Check.earliest(cands, pool);
    if (opts && Basics.isStr(opts.only)) firsts = firsts.filter(x => x.hash === opts.only);
    crossedOut = firsts.length > 1 ? firsts.map(x => x.hash).sort() : [];
    forks = pairsInDeal();
    accept = firsts.slice().sort(Basics.byHash)[0] || null;
    // the buyer signs first, an order naming the instance and its price; the seller's transfer `for` it, `to_owner` her, of that instance, is his yes and his delivery in one block: the deal binds there
    if (!accept && sideOfB(Q) === 'to' && Q.state.status === undefined && Check.linesOf(Basics.termsOf(Q)).some(l => Basics.isStr(l.what) && l.price !== undefined) && !(opts && Basics.isStr(opts.only))) {
      const spots = D.filter(b => b.type === 'transfer' && b.state.status === undefined && b.refs.answers === undefined && b.state.covers !== undefined && Check.asList(b.refs.for).includes(P.hash) && sideOfB(b) === 'from' && b.refs.to_owner === who(Q) &&
        Check.asList(b.refs.what).some(h => Check.whatsOf(Q).includes(h)) && Identity.counts(b, pool));
      accept = Check.earliest(spots, pool).sort(Basics.byHash)[0] || null;
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
    const keeps = (b, taker) => (b.refs[offKey] === undefined || b.refs[offKey] === openOk) && (b.refs[openKey] === undefined || (Basics.isStr(taker) && b.refs[openKey] === taker));
    const opposite = (c, taker, x) => who(c) === offerer ? who(x) === taker : who(x) === offerer;
    const chain = []; // { c, taker, parent }
    for (const c of D) if (c.type === 'promise' && c.state.status === undefined && c.refs.answers === P.hash && who(c) !== offerer && !quoteOffer(c) && keeps(c, who(c))) chain.push({ c, taker: who(c), parent: null });
    for (let i = 0; i < chain.length; i++) {
      const { c, taker } = chain[i];
      for (const n of D) {
        if (n.type !== 'promise' || n.state.status !== undefined || n.refs.answers !== c.hash || chain.some(x => x.c === n) || quoteOffer(n) || !keeps(n, taker) || !opposite(c, taker, n)) continue;
        let ended = false;
        for (let j = i; j !== null; j = chain[j].parent) ended = ended || D.some(a => isAcc(a) && a.refs.answers === chain[j].c.hash && opposite(chain[j].c, taker, a) && pool.sees(n.hash, a.hash));
        if (!ended) chain.push({ c: n, taker, parent: i });
      }
    }
    const takerOf = r => { const x = chain.find(y => y.c === r); return x ? x.taker : who(r); };
    const counterReq = b => chain.some(x => x.c === b);
    const requests = quoteOffer(Q) ? chain.map(x => x.c) : D.filter(b => (isAcc(b) && b.refs.answers === P.hash && who(b) !== who(Q)) || counterReq(b));
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
    // allocations are read in the order of their `seq` (the offerer's line); a hash only breaks a tie in the listing, and picks nothing
    const allocs = D.filter(allocOf).sort((a, b) => ((a.state.seq || 0) - (b.state.seq || 0)) || Basics.byHash(a, b));
    // a taker withdraws her request as an author withdraws an offer: an allocation binds nothing once her withdrawal is in its causal past
    const withdrawn = (r, a) => D.some(w => w.type === 'promise' && w.state.status === 'stopped' && w.state.stop === 'before' && w.refs.updates === r.hash && pool.sees(a.hash, w.hash));
    // a stopped allocation frees its quantity: an onward stop of it by either side of its deal (the offerer's updates, the taker's answers), for the
    // allocations that see the stop
    const stopsAlloc = (w, t) => w.type === 'promise' && w.state.status === 'stopped' && w.state.stop === 'onward' &&
      ((w.refs.updates === t.allocation && who(w) === who(pool.get(t.allocation))) || (w.refs.answers === t.allocation && (who(pool.get(t.allocation)) === who(Q) ? who(w) === t.who : who(w) === who(Q))));
    const stoppedFor = (t, a) => D.some(w => stopsAlloc(w, t) && pool.sees(a.hash, w.hash));
    freedBy = t => D.some(w => stopsAlloc(w, t));
    for (const a of allocs) {
      // every allocation the offerer signed binds the offerer: two that do not see each other prove her lie (forks), and a lie never
      // frees the liar; allocations that together bind more than she offered are her broken promise, to come to each taker
      for (const t of takers) if ((who(pool.get(t.allocation)) === who(a)) && !pool.sees(a.hash, t.allocation)) forks.push(t.allocation, a.hash);
      const r = requests.find(x => x.hash === a.refs.answers);
      if (withdrawn(r, a)) continue;
      // a judge's ruling reaches an allocation as it reaches an accept (one rule for every deal): an allocation, or the request it
      // answers, that the deal's judge defeats binds nothing; the bench is the open offer's schema's, between its offerer and this taker, with any
      // judge both named for the offer or for the allocation's own deal
      // (a counter's deal is read by the counter's own schema, as any bound offer's)
      { const sides = [sideAt(sideOfB(Q), a), takerOf(r)].filter(Basics.isStr); const sch = (r.state.status === undefined ? r : Q).refs.schema; const b = benchOf(sch && pool.get(sch), sides, a, [P.hash, a.hash]); if (b.ruling(a.hash) === false || b.ruling(r.hash) === false) continue; }
      // one request is allocated once: a later allocation of a request an allocation already binds (not stopped in this one's causal past) binds nothing
      if (takers.some(t => headOf(pool.get(t.request)) === headOf(r) && !stoppedFor(t, a))) continue;
      const isCounter = r.state.status === undefined;
      // the offerer's accept of a counter keeps to the counter, as any accept keeps to the offer it answers (invariant 15)
      if (isCounter && !fits(a, r)) continue;
      // what the allocation draws on each line (promises.md, Who may bind): the quantity it names for the line, else what its request names, else
      // the whole line; a counter's lines are its own, whole, each drawn on the open offer's line of the same id
      const pick = (x, id) => { const l = Basics.isObj(x.state.terms) && Array.isArray(x.state.terms.lines) ? x.state.terms.lines.find(c => Basics.isObj(c) && c.id === id) : undefined; return l ? l.quantity : undefined; };
      let bindsIt = true; const drawn = [];
      for (const line of isCounter ? Check.linesOf(Basics.termsOf(r)) : offerLines) {
        const asked = isCounter ? undefined : pick(r, line.id);
        const q = pick(a, line.id) || pick(r, line.id) || (isAmount(line.quantity) ? line.quantity : undefined);
        // an allocation binds a taker to no more than she asked for: no larger than her request names, in its unit
        if (asked !== undefined && !(Basics.isObj(q) && q.unit === asked.unit && dec(q.value) && decCmp(q.value, asked.value) <= 0)) bindsIt = false;
        // on a line with a quantity, what it draws is an amount in the line's unit; on a range, no less than its min (a range is what may be chosen, never a choice)
        if (Basics.isObj(line.quantity)) {
          const u = lineUnit(line.quantity);
          if (!(isAmount(q) && q.unit === u)) bindsIt = false;
          else if (Basics.isObj(line.quantity.min) && line.quantity.min.unit === u && fcmp(frac(q.value), frac(line.quantity.min.value)) < 0) bindsIt = false;
        }
        drawn.push({ id: line.id, quantity: q === undefined ? null : q });
      }
      if (!bindsIt) continue;
      takers.push({ who: takerOf(r), request: r.hash, allocation: a.hash, lines: drawn });
    }
    // each allocation is a draw on the open offer's lines (folds.md, What is left): one that does not take still binds her and is shown over-allocated.
    // Allocations the record does not order are counted together, in rounds: each round the allocations with no other left in their causal past; an
    // allocation is counted against another only where the other is in its past (and not freed for it). Where on any line a round comes to more than
    // is left for any of it, none of that round takes. A line with no quantity is one whole, which one allocation takes.
    {
      // the draw is the offerer's own word on her quantity: her allocation, or, where the taker's accept of her counter binds (a chain), that counter of hers
      const drawOf = t => { const al = pool.get(t.allocation), rq = pool.get(t.request); return who(al) === who(Q) || !rq || who(rq) !== who(Q) ? al : rq; };
      const ONE = { n: 1n, d: 1n };
      const caps = offerLines.map(l => (!Basics.isObj(l.quantity) ? ONE : Grants.isRL(l.quantity) ? (isAmount(l.quantity.max) ? dec(l.quantity.max.value) : null) : isAmount(l.quantity) ? dec(l.quantity.value) : null));
      const wants = takers.map(t => offerLines.map(l => {
        if (!Basics.isObj(l.quantity)) return ONE;
        const x = (t.lines || []).find(y => y.id === l.id), q = x && x.quantity;
        return isAmount(q) && q.unit === lineUnit(l.quantity) ? dec(q.value) : F0;
      }));
      const blocks = takers.map(drawOf);
      const freers = takers.map(t => D.filter(w => stopsAlloc(w, t)));
      const offererKnown = Basics.isStr(who(Q));
      const taken = [], takes = takers.map(() => false);
      let left = takers.map((_, i) => i);
      while (left.length) {
        const mins = left.filter(i => !left.some(j => j !== i && pool.sees(blocks[i].hash, blocks[j].hash)));
        const avail = (i, j) => (caps[j] === null ? null : taken.filter(t => pool.sees(blocks[i].hash, blocks[t].hash) && !freers[t].some(w => pool.sees(blocks[i].hash, w.hash))).reduce((v, t) => fsub(v, wants[t][j]), caps[j]));
        const fitsAll = offererKnown && offerLines.every((_, j) => { const sum = mins.reduce((v, i) => fadd(v, wants[i][j]), F0); return mins.every(i => { const av = avail(i, j); return av === null || fcmp(sum, av) <= 0; }); });
        for (const i of mins) if (fitsAll && wants[i].some(fpos)) { takes[i] = true; taken.push(i); }
        left = left.filter(i => !mins.includes(i));
      }
      takers.forEach((t, i) => { t.over_allocated = !takes[i]; });
    }
    forks = [...new Set(forks)];
    // WHICH: a request on an open offer binds only by the offerer's yes, the allocation: until then it is a request
    for (const r of requests) if (!takers.some(t => headOf(pool.get(t.request)) === headOf(r)) && !requestsOut.some(x => x.block === r.hash)) requestsOut.push({ block: r.hash, open: ['which'] });
    if (takers.length) accept = pool.get(takers[0].allocation);
  }
  out.takers = takers; out.forks = forks.sort();
  out.crossed = crossedOut; out.per_accept = []; out.requests = requestsOut.sort((x, y) => Basics.cmp(x.block, y.block));
  // a block of the deal that speaks for a side and does not yet stand is listed in `waiting` (blocks.md, Finality) and counts nowhere yet
  for (const b of D) { if (!Basics.isStr(b.refs.author) || !who(b)) continue; const st = Identity.standsOf(b, pool); for (const wv of st.waiting) if (!out.waiting.some(x => x.block === b.hash && x.on === wv.on)) out.waiting.push({ block: b.hash, on: wv.on }); }
  out.waiting.sort((x, y) => Basics.cmp(x.block, y.block) || Basics.cmp(x.on, y.on));
  // the offer the binding accept answers; with none, the live offer when there is only one
  out.offer = accept ? live.hash : (lives.length === 1 ? lives[0].hash : null);
  out.live = lives.map(o => o.hash).sort();
  out.accept = accept ? accept.hash : null;
  if (accept) out.accept = accept.hash;
  // before a binding accept nothing is chosen or settled: the quantity, total, lines and paid stay empty
  // her plan has no stage: its later blocks are her own record (promises.md, Her plan)
  if (self) { out.stage = null; return out; }
  if (!accept) {
    { const b0 = benchOf(Q.refs.schema && pool.get(Q.refs.schema), [Q.refs.from, Q.refs.to].filter(Basics.isStr), null); out.bench = b0.names.length ? { names: b0.names, needed: b0.needed, wait: b0.wait, clocks: b0.clocks } : 'none'; }
    if (lives.every(o => stopsBefore.some(s => stopsOne(s, o.hash)))) { out.stage = 'stopped'; out.stop = 'before'; }
    else if (!open && lives.some(o => declines.some(d => d.refs.answers === o.hash && sideOfB(d) && sideOfB(d) !== sideOfB(o)))) out.stage = 'declined';
    else out.stage = sideOfB(Q) === 'to' ? 'asked' : 'offered';
    return out;
  }
  // an open offer is settled by no one: each allocation is a deal of its own (promises.md, Who may bind). What is left to say of the offer itself is
  // that it binds, or that its offerer stopped it onward.
  if (open && accept) {
    // its lines are what its allocations that take bind together on each, and its total what the price comes to for that (folds.md, What each fold returns)
    const bound = takers.filter(t => !freedBy(t) && t.over_allocated !== true);
    const drawnOn = (t, id) => { const x = (t.lines || []).find(y => y.id === id); return x && isAmount(x.quantity) ? x.quantity : undefined; };
    const sumOn = (ts, l) => { const u = lineUnit(l.quantity); const qs = ts.map(t => drawnOn(t, l.id)).filter(q => q && q.unit === u); return qs.length ? { value: fText(fsum(qs.map(q => q.value))), unit: u } : null; };
    out.lines = offerLines.map(l => ({ id: l.id, needed: sumOn(bound, l), moved: null }));
    out.over_allocated = takers.some(t => t.over_allocated === true);
    // a counter its offerer accepted binds at the counter's own price: the total is then the price of what the requests bind plus each counter's own
    // total, of one kind (several kinds, or a price with no total: null)
    const counterOf = t => { const r = pool.get(t.request); return r && r.state.status === undefined ? r : null; };
    const mine = bound.filter(t => !counterOf(t)), ps = [];
    if (mine.length) for (const l of offerLines.filter(l => l.price !== undefined)) { const q = sumOn(mine, l); ps.push(totalOf(l.price, q === null ? undefined : q)); }
    for (const t of bound.filter(counterOf)) for (const l of Check.linesOf(Basics.termsOf(counterOf(t))).filter(l => l.price !== undefined)) ps.push(totalOf(l.price, drawnOn(t, l.id)));
    const r2 = ps.length ? sumParts(ps) : null;
    if (r2) out.total = amtOut(r2.f, r2.kind);
    // only a stop of the offer itself stops it: the offerer's stop of one allocation ends that allocation's deal alone
    const ow = Check.earliest(onward.filter(b => who(b) === who(Q) && stopsOne(b, Q.hash)), pool)[0];
    if (ow) { out.stage = 'stopped'; out.stop = 'onward'; out.from = ow.hash; out.by = sideOfB(ow) === 'from' ? 'from' : 'to'; } else out.stage = 'accepted';
    return out;
  }
  // the terms are those of the offer the binding accept answers (promises.md: an accept consents to the block it names)
  // a line's price fixed later (promises.md, Terms): read as the flat amount it comes to once fixed; until then it has no total
  const fixings = Check.linesOf(Basics.termsOf(live)).map(l => Bytes.fixingOf(l, P, pool));
  const fixing = fixings.some(f => f !== null) ? { fixed: fixings.every(f => f === null || f.fixed) } : null;
  const terms = { ...Basics.termsOf(live), lines: Check.linesOf(Basics.termsOf(live)).map((l, i) => (fixings[i] && fixings[i].fixed ? { ...l, price: fixings[i].price } : l)) };
  // the lines chosen (promises.md, Answers): the binding accept's terms.lines, else what the allocation draws (a range is what may be chosen, not a choice)
  const chosen = takers.length === 1 ? takers[0].lines : accept && accept !== P && Basics.isObj(Basics.termsOf(accept)) ? Basics.termsOf(accept).lines : undefined;
  // total: each priced line comes to its flat amount, or its amount per unit times its quantity chosen over per (in per's kind). A price whose total cannot be
  // computed (no quantity in its kind, a per of zero, no finite decimal) is never paid: the promise is never done, and its total is null (folds.md)
  const parts = pricedParts(terms, chosen);
  const computable = parts.every(x => x !== null);
  const totalR = computable && parts.length ? stepUp(sumParts(parts), terms.step) : null;
  let totalF = totalR ? totalR.f : null, kindP = totalR ? totalR.kind : null; // kindP: the kind the price is in
  let total = totalR ? amtOut(totalF, kindP) : null;
  out.total = total;
  out.price_fixed = fixing ? fixing.fixed : null;
  const notShown = r => { throw { notShown: true, lacks: r.lacks }; };
  // ---- what is to come (promises.md, Handing on a receiving place): what is to come to each side, and the hand-overs of it, each a draw on what is to come to its signer (folds.md, What is left)
  // What moves is to come to the `to` side, one whole; the price to the `from` side. A side that names a thing is Bearer's, never read here.
  const toComeSide = k => { const r = Q.refs[k]; if (self || (r !== undefined && r !== '' && isThing(r))) return null; const w = sideAt(k, accept); return Basics.isStr(w) && w !== '' ? w : null; };
  const toComeCands = self ? [] : pool.all().filter(t => t.type === 'transfer' && Check.asList(t.refs.what).includes(P.hash) && t.state.status === undefined && t.refs.answers === undefined && t.refs.to_owner !== undefined &&
    (Identity.counts(t, pool) || Identity.forkedOnly(t, pool)) && pool.sees(t.hash, accept.hash));
  const toComeActive = toComeCands.length > 0;
  const toComeMemo = new Map();
  const startFor = o => [accept, P, Q].find(b => b && Things.speakerOf(b, pool) === o) || accept;
  // a hand-over is a draw on the side what is to come to its signer is on (what moves, or the price): it is listed under the side where it does not read `not_owner`, `unit` or `no_measure`; each side's owner starts at
  // the binding accept or the offer, whichever that side signed; `to_come` is null until a counted hand-over of the deal is given
  const toComeRead = (vis, key) => {
    if (toComeMemo.has(key)) return toComeMemo.get(key);
    const toOwner = toComeSide('to'), fromOwner = toComeSide('from');
    const cands = toComeCands.filter(t => vis(t.hash));
    // what moves is to come as one whole
    const toM = { kind: null, said: false, byUnit: false, f0: Things.WHOLE };
    const fromM = !fixing && totalF && kindP ? { kind: kindP, said: true, byUnit: true, f0: totalF } : null;
    const run = (owner, m) => {
      if (!m || !Basics.isStr(owner)) return null;
      const draws = cands.map(t => ({ block: t, by: Things.speakerOf(t, pool), to: Check.asList(t.refs.to_owner)[0], amount: isAmount(t.state.amount) ? t.state.amount : null, lands: 'accept', stays: true, kind: 'transfer' }))
        .filter(d => Basics.isStr(d.by) && (!d.amount || fpos(dec(d.amount.value))));
      const r = Things.drawsOn(pool, { kind: m.kind, said: m.said, byUnit: m.byUnit, firsts: [{ owner, start: startFor(owner), f: m.f0 }], adds: [] }, draws, { seen: vis });
      if (r.not_shown) notShown(r);
      return r;
    };
    const rTo = run(toOwner, toM), rFrom = run(fromOwner, fromM);
    const ownersOf = (r, m) => (r ? [...r.owners.entries()].filter(([, f]) => fpos(f)).sort((a, b) => Basics.cmp(a[0], b[0])).map(([owner, f]) => ({ owner, f, amount: m.said ? amtOut(f, m.kind) : null })) : []);
    const toList = ownersOf(rTo, toM), fromList = ownersOf(rFrom, fromM);
    // a hand-over is a draw on the side what is to come to its signer is on; the side where it does not read as "not the owner" is the one it is listed under
    const merged = new Map();
    const worth = e => (e.takes ? 3 : !['not_owner', 'unit', 'no_measure'].includes(e.why) ? 2 : 1);
    for (const r of [rTo, rFrom]) if (r) for (const e of r.entries) { const have = merged.get(e.block); if (!have || worth(e) > worth(have.e)) merged.set(e.block, { e, r }); }
    const drawsOut = [...merged.values()].map(x => x.e).sort((a, b) => Basics.cmp(a.block, b.block));
    const moves = [];
    for (const { e, r } of merged.values()) { const row = r.rows.get(e.block); if (row && row.takes && row.landed) moves.push([e.block, e.by, e.to, row.landedF || row.amount]); }
    const res = { to: toList, from: fromList, draws: drawsOut, moves, toOwners: toList.map(x => x.owner), fromOwners: fromList.map(x => x.owner) };
    toComeMemo.set(key, res);
    return res;
  };
  // what is to come as a block sees it, and once every hand-over given is read
  const toComeSeenBy = b => { const past = pool.past(b.hash); return toComeRead(h => past.has(h), 'seen ' + b.hash); };
  const toComeLatest = () => toComeRead(() => true, 'latest');
  // ---- settling: counted blocks made for P
  // the deal's schema is the bound offer's own (promises.md: once a counter binds, the deal's terms are the counter's own, whole)
  const schema = live.refs.schema && pool.get(live.refs.schema);
  // a block confirms or defeats only if its author is named: an id
  // a judge is one the deal's schema names in its grounds (`grounds.bench`) or both sides named; no caller adds one (a stage is a function of the blocks alone)
  // a side of the deal, or a role inside a side's circle, is never its judge (invariant 13): such a name adds nothing
  const openName = sideOfB(Q) === 'from' ? 'to' : 'from';
  const receiverAtTie = k => { const r = sideAt(k, accept); return Basics.isStr(r) ? r : k === openName ? ((takers[0] && Basics.isStr(takers[0].who) && takers[0].who) || accept.refs.author) : undefined; };
  const dealSides = ['from', 'to'].map(receiverAtTie).filter(Basics.isStr);
  holdersFn = () => (toComeActive ? [...new Set([...toComeLatest().toOwners, ...toComeLatest().fromOwners])] : []);
  const bench = benchOf(schema, dealSides, accept);
  out.bench = bench.names.length ? { names: bench.names, needed: bench.needed, wait: bench.wait, clocks: bench.clocks } : 'none';
  out.judge_ties = bench.ties(['from', 'to'].map(k => [k, receiverAtTie(k)]));
  const namedBy = c => bench.named(c);
  const confirmed = h => pool.all().some(c => Check.asList(c.refs.confirms).includes(h) && namedBy(c));
  // the deal's judge: as many of the bench's names as are needed (promises.md, Disputes). Its word is the last: a block they defeat counts for
  // nothing unless each changed its ruling; one they confirm counts whatever a side says of it. true, false, or null when they have not spoken.
  const ruling = h => bench.ruling(h);
  // a receiver's accept of a transfer counts unless the giver withdrew the transfer first or, on one that carried expires, declined the accept; an
  // answer the judge defeats counts for nothing
  // standingAnswer(b, byReceiver): the accepted answers to b that stand (folds.md): from the receiving side, and the giver did not withdraw a transfer
  // first (answerStands) nor the judge defeat the answer
  const standingAnswer = (b, byReceiver = () => true) => D.filter(a => a.refs.answers === b.hash && a.state.status === 'accepted' && byReceiver(a) &&
    (b.type !== 'transfer' || Things.answerStands(b, a, pool)) && ruling(a.hash) !== false);
  const accepted = (b, receiver) => standingAnswer(b, a => receiver === undefined || who(a) === receiver).length > 0;
  // only the deal's judge changes what counts (folds.md, Defeated blocks): a side's defeats erases nothing; the stage shows it as disputed
  const defeated = h => ruling(h) === false;
  const partSide = b => sideOfB(b); // a block counts for the side it speaks for
  const settling = D.filter(b => !defeated(b.hash) && b.refs.answers === undefined && b.hash !== P.hash && b.type !== 'promise' && Check.asList(b.refs.for).includes(P.hash) && partSide(b));
  // who a side is where a block stands; an open side is the taker, or the accepter
  const otherName = sideOfB(Q) === 'from' ? 'to' : 'from';
  const receiverAt = (side, b) => { const r = sideAt(side, b); if (Basics.isStr(r)) return r; return side === otherName ? ((takers[0] && Basics.isStr(takers[0].who) && takers[0].who) || accept.refs.author) : undefined; };
  // a transfer to a side counts once that side answers it accepted (the side read where its answer stands), or a named signer confirms it
  // who may answer b for the right of a side: once what is to come has been handed over, the owner of that right where b stands; else the side where the answer stands
  const rcvs = (side, b, a, rights) => {
    if (rights && toComeActive) {
      const o = toComeSeenBy(b), owners = side === 'to' ? o.toOwners : o.fromOwners;
      if (owners.length) return owners;
    }
    const r = receiverAt(side, a);
    return Basics.isStr(r) ? [r] : [];
  };
  const answersTo = (b, side, rights) => standingAnswer(b, a => rcvs(side, b, a, rights).some(r => who(a) === r && Check.asList(b.refs.to_owner).includes(r)));
  const countedTo = (b, side, rights) => answersTo(b, side, rights).length > 0 || receivedAbout(b, side).length > 0 || (rcvs(side, b, b, rights).some(r => Check.asList(b.refs.to_owner).includes(r)) && confirmed(b.hash));
  // a transfer that names an instance moves toward a line only as a draw on it that lands, of the line's what (the thing itself, or one whose refs.of names it)
  // (folds.md, What is left, The other side)
  const ofLine = (h, what) => { const t = pool.get(h), whats = Check.asList(what); return !!t && t.type === 'thing' && (whats.includes(h) || Check.asList(t.refs.of).some(k => whats.includes(k))); };
  const landedDrew = (b, h) => {
    const r = Things.ownershipFold(h, pool);
    if (r.not_shown) notShown(r);
    const e = r.draws.find(x => x.block === b.hash && x.takes && x.state === 'landed');
    if (!e) return null;
    return { took: e.took, whole: !r.stated, unit: r.stated ? r.stated.unit : null, of: r.kind ? r.kind.of : null };
  };
  // "read as a transfer that names no instance" (folds.md, One whole) is read for the stage: it counts toward its line or price in its own kind on the receiver's accept, and not as a draw
  // a transfer that draws an amount on an instance that states no pack takes nothing there (no_measure), and is read as a transfer that names no instance (folds.md, One whole)
  const asNone = b => isAmount(b.state.amount) && Check.asList(b.refs.what).length > 0 && Check.asList(b.refs.what).every(h => { const r = Things.ownershipFold(h, pool); if (r.not_shown) notShown(r); const e = r.draws.find(x => x.block === b.hash); return !!e && !e.takes && e.why === 'no_measure'; });
  const receivedAbout = (b, side) => D.filter(r => r.type === 'observe' && r.state.kind === 'received' && Check.asList(r.refs.answers).includes(b.hash) && isAmount(r.state.amount) && sideOfB(r) === side && !defeated(r.hash) && Identity.binds(r, pool));
  // her order, where it is in the block's causal past and states that it is her word that the goods are in her hand (`terms.in_hand: true`), counts the block toward what moves to her. An order that does not say so counts nothing toward what came. No order counts toward a price.
  // for no more than the order states for that line, in all: what came above it is the giver's word alone and counts nothing
  const orderInHand = b => D.some(o => o.type === 'promise' && o.state.status === undefined && o.refs.answers === undefined && Basics.termsOf(o).in_hand === true && sideOfB(o) === 'to' && o.hash !== b.hash && pool.sees(b.hash, o.hash));
  const goods = [], pays = [], refunds = [], works = [], unanswered = [], receivedFrom = [], receivedTo = [], attempts = [];
  // a block of the deal whose every accepted answer the bench defeated counts for nothing in the stage (only the bench changes what counts); a draw that landed stays landed (ownership is the draw's own causal past)
  const answersDefeated = b => { const ans = D.filter(a => a.refs.answers === b.hash && a.state.status === 'accepted'); return ans.length > 0 && ans.every(a => ruling(a.hash) === false); };
  // the kinds of the lines (each line's quantity chosen): a transfer that names none counts toward a line only in its kind; a line that names no
  // `what` moves its quantity, an amount (a loan of money)
  const lineKinds = Check.linesOf(terms).map(l => Check.quantityOf(l, chosen)).filter(isAmount).map(kindOf);
  // the instances the lines' prices name (`of`): a payment by the very thing named
  const priceOfs = Check.linesOf(terms).map(l => l.price).filter(Basics.isObj).map(p => (Basics.isStr(p.of) ? p.of : Basics.isObj(p.amount) && Basics.isStr(p.amount.of) ? p.amount.of : null)).filter(Basics.isStr);
  for (const b of settling) {
    if (b.type === 'transfer') {
      // a payment for several promises pays each only by its split: with none, it pays none of them (things.md, Transfers)
      if (Check.asList(b.refs.for).length > 1 && !Array.isArray(b.state.split)) continue;
      const side = sideOfB(b), names = Check.asList(b.refs.what).length > 0 && !asNone(b), amt = isAmount(b.state.amount) ? b.state.amount : null;
      if (!names && !amt) continue;
      if (side === 'to') {
        // a payment speaks for the paying side (to) and goes to the from side; no one pays by another's hand (folds.md, What is left)
        attempts.push(b);
        // or by the very thing named: a draw on the instance the price's `of` names that lands (her yes may be the deal's own first promise)
        if (countedTo(b, 'from', true) || (names && priceOfs.some(of => Check.asList(b.refs.what).includes(of) && (() => { const r = landedDrew(b, of); return !!r && !r.whole; })()))) pays.push(b); else if (!names) unanswered.push(b.hash);
      } else if (side === 'from') {
        // a transfer from the delivering side in the price's kind is a transfer back only where the line's kind is another; in a deal that moves and is paid in one kind (a loan) it is a delivery
        // a transfer back is in the price's kind and is not the line's own kind; any other from-side transfer is a delivery
        const back = !names && amt && kindP && sameKind(amt, kindP) && !lineKinds.some(k => sameKind(k, amt));
        if (back) { if (countedTo(b, 'to', false)) refunds.push(b); else unanswered.push(b.hash); continue; }
        if (names) {
          // an open receiver (an allocation's deal: state.count, no to_owner) on the offerer's word alone (folds.md, What is left)
          const counted = b.state.count !== undefined && b.refs.to_owner === undefined && Q.refs.to === undefined && sideOfB(Q) === 'from' && Identity.counts(b, pool);
          // one that names an instance counts toward a line only as a draw on it that lands (folds.md, What is left, The other side)
          // the receiving side is read where the delivery stands, or (Bearer, promises.md) where the receiving answer stands: a note's holder there who accepts it
          const toReceiver = Check.asList(b.refs.to_owner).some(r => rcvs('to', b, b, true).includes(r)) || standingAnswer(b, a => Check.asList(b.refs.to_owner).includes(who(a)) && rcvs('to', b, a, true).includes(who(a))).length > 0;
          if (!answersDefeated(b) && (counted || (toReceiver && Check.asList(b.refs.what).some(h => landedDrew(b, h))))) goods.push(b);
        } else if (!lineKinds.some(k => sameKind(amt, k))) continue; // a transfer that names none moves something toward a line only in that line's kind
        else if (countedTo(b, 'to', true) || orderInHand(b)) goods.push(b); else unanswered.push(b.hash);
      }
    } else if (b.type === 'observe' && b.state.kind === 'work') {
      // a `work` is its doer's word, in her own name. It counts toward what moves where the job's terms name whose word counts it (`terms.condition`, a `signal` of that kind `by` those named); where the job names no one, where the side the work goes to answers it `accepted`. (the text does not say; read so)
      const receiver = sideAt(partSide(b) === 'from' ? 'to' : 'from', b);
      const wc = Basics.isObj(terms.condition) && terms.condition.signal === 'work' && Basics.isObj(terms.condition.by) && Array.isArray(terms.condition.by.names) ? terms.condition : null;
      if (wc) { if (wc.by.names.includes(who(b)) && partSide(b) === 'from') works.push(b); }
      else if (toComeActive ? standingAnswer(b, a => rcvs('to', b, a, true).includes(who(a))).length > 0 : accepted(b, receiver)) works.push(b);
      else if (confirmed(b.hash)) works.push(b);
    } else if (b.type === 'observe' && b.state.kind === 'received') {
      // a `received` word is read for the side that signs it: the payee's toward the price, the other side's toward the line its `state.line` names (the only line when it names none); the
      // signal of a signer her account word names (`state.by`) is not built
      // a receiver with nothing to answer says what came, her word against herself, added as an accepted transfer is (folds.md, What is left, The other side)
      if (!isAmount(b.state.amount)) continue;
      const side = sideOfB(b);
      if (side === 'from') receivedFrom.push(b); else if (side === 'to') receivedTo.push(b);
    } else if (b.type === 'transform') {
      if (accepted(b) || confirmed(b.hash)) goods.push(b);
    }
  }
  // a `received` by a signer her account word names in `by` counts toward her price only where it names that account word (in `refs.derives_from`) and the place (`state.destination`); the word is the payee's, and her head where the received is signed.
  // A pointer to a word that is not the payee's, or is not her head there, or to a place that word does not list, names no place and counts nothing.
  {
    const payee = receiverAt('from', accept);
    if (Basics.isStr(payee) && kindP !== undefined) for (const r of D) {
      if (r.type !== 'observe' || r.state.kind !== 'received' || !Check.asList(r.refs.for).includes(P.hash) || !isAmount(r.state.amount) || r.refs.author === payee || !Identity.binds(r, pool) || defeated(r.hash)) continue;
      const past = pool.past(r.hash), heads = Consent.accountHeads(payee, pool, past);
      const aw = Check.asList(r.refs.derives_from).map(h => pool.get(h)).find(x => x && x.type === 'observe' && x.state.kind === 'account' && (x.refs.author === payee || x.refs.as === payee));
      if (!aw || heads.length !== 1 || heads[0] !== aw || !Consent.destinationsOk(aw.state.destinations)) continue;
      // `by` names the signer by the id of the person who signs the received (its author) (the text does not say; read so)
      if (!Basics.isStr(r.state.destination) || !aw.state.destinations.some(x => x.destination === r.state.destination && x.by === r.refs.author)) continue;
      receivedFrom.push(r);
    }
  }
  // ---- the other side: a plain sum, in its own kind, of what the receiver accepted, or of what her accepted answer says it covers where that is more (of several answers, the
  // one that says most). A payment that names an instance counts toward a price only where the price states an `of` and the instance's refs.of is that id.
  const coversIn = (b, side, kind) => answersTo(b, side, side === 'from').map(a => a.state.covers).filter(c => isAmount(c) && unitOf(c, kind)).reduce((mx, c) => fmax(mx, dec(c.value)), F0);
  // a payment that names an instance counts its landed draw's amount toward a price only where the price states an `of` that is the instance's refs.of and the units agree; otherwise only
  // what the payee's answer says it covers (the largest of several); a payment with a `split` counts as its parts for this deal say
  // one payment counts once, at the most its receiving side has said of it (folds.md, What is left, The other side): of her counted accepted
  // answers to a transfer that names no instance, each says its amount, or the state.amount it states in that kind (no more than the transfer's);
  // the one that says most counts. With none (a signer she named counted it), the transfer's own amount.
  // the words of one side about one block count once, at the most any of them says: her own words, and each word of a tool that speaks for her. A `received` that `answers` a transfer is a word about that transfer; one that answers none is a payment of its own.
  const unitOf = (a, kind) => isAmount(a) && a.unit === kind.unit; // in that half's `unit`; no fold compares `of`
  const saidIn = (b, side, kind) => {
    kind = kind || (isAmount(b.state.amount) ? kindOf(b.state.amount) : null);
    const own = isAmount(b.state.amount) ? dec(b.state.amount.value) : null;
    let best = F0;
    const words = answersTo(b, side, true);
    // counted by a named signer, or by her order in hand: no word of hers says less, so the block's own amount in the unit
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
    if (Array.isArray(b.state.split)) return b.state.split.filter(x => Basics.isObj(x) && x.for === P.hash && isAmount(x.amount) && unitOf(x.amount, kind)).reduce((s, x) => fadd(s, dec(x.amount.value)), F0);
    if (Check.asList(b.refs.what).length && !asNone(b)) {
      let f = F0;
      for (const h of Check.asList(b.refs.what)) {
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
    if (Array.isArray(b.state.split)) { const x = b.state.split.find(y => Basics.isObj(y) && y.for === P.hash && isAmount(y.amount)); return x ? [kindOf(x.amount)] : []; }
    const cs = answersTo(b, 'from', true).map(a => a.state.covers).filter(isAmount);
    if (cs.length) return cs.map(kindOf);
    return isAmount(b.state.amount) ? [kindOf(b.state.amount)] : [];
  };
  if (!kindP) {
    const ks = [...new Map(pays.flatMap(kindsOfPay).map(k => [Bytes.jcs(k), k])).values()];
    if (ks.length === 1) kindP = ks[0];
  }
  const sentF = kindP ? pays.reduce((s, b) => fadd(s, ownIn(b, kindP)), F0) : F0;
  // a part of the price handed to the one who is to pay it is paid, with no money moved
  const payer = receiverAt('to', accept);
  const setoffF = toComeActive && Basics.isStr(payer) && kindP && !fixing ? (toComeLatest().from.filter(x => x.owner === payer).reduce((s, x) => fadd(s, x.f), F0)) : F0;
  const setoff = fpos(setoffF);
  const receivedPaid = kindP ? receivedFrom.reduce((s, b) => (unitOf(b.state.amount, kindP) ? fadd(s, dec(b.state.amount.value)) : s), F0) : F0;
  // the seller's `covers` on his spot-exchange transfer is the payee's word that this much of the price came: it counts at what he said, in the price's unit
  const spotCoversF = spotAccept && kindP && isAmount(spotAccept.state.covers) && unitOf(spotAccept.state.covers, kindP) ? dec(spotAccept.state.covers.value) : null;
  const paidF = kindP ? fadd(fadd(fadd(pays.reduce((s, b) => fadd(s, towardIn(b, 'from', kindP)), F0), setoffF), receivedPaid), spotCoversF === null ? F0 : spotCoversF) : F0;
  const refundedF = kindP ? refunds.reduce((s, b) => fadd(s, towardIn(b, 'to', kindP)), F0) : F0;
  // a block that counts nothing toward the price is as if it were not there: `paid` stays null until a block counts (a payment the payee has not answered pays nothing)
  if ((pays.length || setoff || receivedFrom.length || spotCoversF !== null) && kindP) out.paid = amtOut(paidF, kindP);
  // on a deal priced per unit of work, a payment `for` it counts the work its doer stated in the payment's causal past, oldest first, at the price per unit (so a doer's word that nobody answered is counted by the payer's own payment)
  // a job (promises.md, Settling): its lines name no `what`, and its state.what says what is done
  const isWork = !Check.linesOf(terms).some(l => Basics.isStr(l.what)) && (live.state.what !== undefined || Q.state.what !== undefined);
  for (const jl of isWork ? Check.linesOf(terms) : []) {
    if (!(Check.perUnit(jl.price) && Basics.isObj(jl.price.amount) && Basics.isObj(jl.price.per) && kindP && sameKind(jl.price.amount, kindP) && fpos(dec(jl.price.amount.value)) && pays.length)) continue;
    const unit = jl.price.per.unit, a = dec(jl.price.amount.value), pv = dec(jl.price.per.value);
    let capacity = fdiv(fmul(paidF, pv), a);
    const pastOfPays = new Set(pays.flatMap(x => [...pool.past(x.hash)]));
    const doerWork = D.filter(o => o.type === 'observe' && o.state.kind === 'work' && Basics.isObj(o.state.amount) && o.state.amount.unit === unit && fpos(dec(o.state.amount.value)) && partSide(o) === 'from' && Identity.counts(o, pool) && !defeated(o.hash) && pastOfPays.has(o.hash))
      .sort((x, y) => (pool.past(x.hash).size - pool.past(y.hash).size) || Basics.cmp(x.hash, y.hash));
    for (const w of doerWork) {
      const amt = dec(w.state.amount.value);
      if (works.includes(w)) { capacity = fsub(capacity, fmin(amt, capacity)); continue; }
      const take = fmin(amt, capacity);
      if (fpos(take)) { works.push({ hash: w.hash, state: { amount: { value: fText(take), unit } } }); capacity = fsub(capacity, take); }
    }
  }
  // `unanswered` lists the transfers of either side that name no instance, are `for` the deal and speak for a side, and that the other side has not accepted (nor a named signer confirmed)
  // with a block that a `received` the payee's account word names answers is answered
  out.unanswered = [...new Set(unanswered)].filter(h => !receivedFrom.some(r => Check.asList(r.refs.answers).includes(h))).sort();
  // lines: how much of each line the counted transfers moved, each at its quantity chosen (a line that names no `what` moves its quantity, an amount)
  const lineSpecs = isWork ? [] : Check.linesOf(terms).map(l => { const q = Check.quantityOf(l, chosen); return { id: l.id, what: Basics.isStr(l.what) ? l.what : null, quantity: isAmount(q) ? q : null, kind: isAmount(q) ? kindOf(q) : null, exact: isAmount(q) ? dec(q.value) : null, per: Basics.isObj(l.price) && Check.perUnit(l.price), price: l.price }; });
  // a block for the deal counts toward a line (promises.md, Terms): it names the line in state.line; or it names none and fits this line alone (an instance
  // of the line's what, or an amount in the line's kind)
  const fitsLine = (t, l) => (Check.asList(t.refs.what).length && !asNone(t) ? Check.asList(t.refs.what).some(h => l.what !== null && ofLine(h, l.what)) : isAmount(t.state.amount) && (l.kind ? sameKind(t.state.amount, l.kind) : false));
  const forLine = (t, l) => (t.state.line !== undefined ? t.state.line === l.id : fitsLine(t, l) && lineSpecs.filter(x => fitsLine(t, x)).length === 1);
  // catch weight (promises.md, Terms): under a per-unit price, terms.band is how far what is delivered may fall from the quantity chosen, either way, as
  // a fraction of it. What the receiver accepted inside the band covers the line and is what is priced; outside it the quantity chosen is priced, and
  // less than the band's bottom does not cover the line.
  const band = Basics.isStr(terms.band) && dec(terms.band) ? frac(terms.band) : null;
  const lineInfo = [];
  for (const l of lineSpecs) {
    // how much counted transfers moved, exactly, in the line's kind: a draw that landed, of the line's what, or an amount that names none; a whole instance (no pack) covers the line
    let whole = false, any = false, exact = F0, byHand = F0;
    const handOrder = D.find(o => o.type === 'promise' && o.state.status === undefined && o.refs.answers === undefined && Basics.termsOf(o).in_hand === true && sideOfB(o) === 'to');
    const handLine = handOrder ? Check.linesOf(handOrder.state.terms).find(x => x.id !== undefined && x.id === l.id) : undefined;
    const handCap = handLine && isAmount(handLine.quantity) && l.kind && sameKind(handLine.quantity, l.kind) ? dec(handLine.quantity.value) : F0;
    for (const t of goods) {
      if (t.type !== 'transfer') continue;
      if (!forLine(t, l)) continue;
      if (Check.asList(t.refs.what).length && !asNone(t)) {
        for (const h of Check.asList(t.refs.what)) {
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
      } else if (isAmount(t.state.amount) && l.kind && sameKind(t.state.amount, l.kind)) { any = true; if (orderInHand(t) && !countedTo(t, 'to', true)) byHand = fadd(byHand, saidIn(t, 'to')); else exact = fadd(exact, saidIn(t, 'to')); }
    }
    exact = fadd(exact, fcmp(byHand, handCap) > 0 ? handCap : byHand);
    for (const b of receivedTo) if (forLine(b, l)) if (l.kind && sameKind(b.state.amount, l.kind)) { any = true; exact = fadd(exact, dec(b.state.amount.value)); }
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
    // `lines[].needed` and `moved` are amounts in the line's kind (folds.md says "a sum in the line's kind"); null where the line states no quantity
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
  // a job: each line is the work that counted, in the unit of its quantity chosen or of its price per unit; it is covered when that work comes to its
  // quantity chosen (not the offer's range), or, with none chosen, when one accepted work block came (folds.md, What is left)
  const workIn = unit => fsum(works.filter(w => Basics.isObj(w.state.amount) && w.state.amount.unit === unit).map(w => w.state.amount.value));
  const workMet = l => { const q = Check.quantityOf(l, chosen); return isAmount(q) ? fcmp(workIn(q.unit), frac(q.value)) >= 0 : works.length > 0; };
  let covered = false;
  if (isWork) {
    const jls = Check.linesOf(terms);
    covered = jls.length ? jls.every(workMet) : works.length > 0;
    for (const l of jls) {
      const q = Check.quantityOf(l, chosen), wunit = isAmount(q) ? q.unit : Basics.isObj(l.price) && Basics.isObj(l.price.per) ? l.price.per.unit : null;
      out.lines.push({ id: l.id, needed: isAmount(q) ? { ...q } : null, moved: wunit === null ? null : amtOut(workIn(wunit), { unit: wunit }) });
    }
  } else if (lineSpecs.length) covered = out.lines.every(l => l.coveredLine);
  else covered = works.length > 0;
  out.lines = out.lines.map(({ id, needed, moved }) => ({ id, needed, moved }));
  // ---- uncovered, for each side (folds.md, What each fold returns): what that side sent for the deal that counted, less what came back to her, less what the other half
  // covered, in its own kind, less the forfeit where it is kept
  const toUncovered = () => {
    if (!kindP || !fpos(fadd(sentF, receivedPaid))) return null;
    let value = F0;
    {
      if (isWork) {
        // a job: each line at a price per unit is worth the counted work, in that unit; a flat line, its price once its work is met
        for (const l of Check.linesOf(terms)) {
          if (!Basics.isObj(l.price)) continue;
          const part = Check.perUnit(l.price) ? totalOf(l.price, { ...l.price.per, value: fText(workIn(l.price.per.unit)) }) : workMet(l) ? totalOf(l.price) : null;
          if (part !== null && sameKind(part.kind, kindP)) value = fadd(value, part.f);
        }
      } else if (lineSpecs.length) {
        lineSpecs.forEach((l, i) => {
          const info = lineInfo[i];
          const lineTerms = { price: l.price, quantity: l.quantity === null ? undefined : l.quantity };
          if (!Basics.isObj(lineTerms.price)) return;
          const qty = insides[i] && isAmount(lineTerms.quantity) ? { ...lineTerms.quantity, value: fText(insides[i]) } : lineTerms.quantity;
          const full = totalOf(lineTerms.price, qty);
          if (full === null || !sameKind(full.kind, kindP)) return;
          if (info.whole || (info.any && l.exact === null)) value = fadd(value, full.f);
          else if (l.exact === null) value = fadd(value, F0);
          else if (fcmp(info.exact, info.least) >= 0) value = fadd(value, full.f);
          else if (l.per) { const part = totalOf(lineTerms.price, { ...lineTerms.quantity, value: fText(info.exact) }); if (part !== null) value = fadd(value, part.f); }
          else {
            // a flat price for a whole: nothing is covered until the whole moves, except what the payer's own accepted answer to a delivery says it covers
            // (promises.md, Settling): her word lowers only what is to come back to her
            let said = F0;
            for (const t of goods) {
              if (t.type !== 'transfer') continue;
              if (!forLine(t, l)) continue;
              if (Check.asList(t.refs.what).length && !Check.asList(t.refs.what).some(h => l.what !== null && ofLine(h, l.what) && landedDrew(t, h))) continue;
              said = fadd(said, coversIn(t, 'to', kindP));
            }
            value = fadd(value, fmin(said, full.f));
          }
        });
      }
    }
    // `forfeit` stays with the payee only where an onward stop that speaks for the paying side is among the first onward stops of the deal and none that speaks for the payee is; in every other ending it is the payer's still (the text does not say; read so)
    const firstStops = Check.earliest(onward, pool), keptByStops = firstStops.some(x => sideOfB(x) === 'to') && !firstStops.some(x => sideOfB(x) === 'from');
    const kept = keptByStops && Basics.isObj(terms.forfeit) && sameKind(terms.forfeit, kindP) && Basics.isStr(terms.forfeit.value) ? dec(terms.forfeit.value) : F0;
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
      const lineTerms = { price: l.price, quantity: l.quantity === null ? undefined : l.quantity };
      let coveredF = F0;
      const priced = lineTerms && Basics.isObj(lineTerms.price) ? totalOf(lineTerms.price, { ...(isAmount(lineTerms.quantity) ? lineTerms.quantity : { unit: l.kind.unit }), value: fText(movedF) }) : null;
      if (priced && kindP && sameKind(priced.kind, kindP)) {
        const labelled = pays.reduce((s, b) => fadd(s, Array.isArray(b.state.split) ? b.state.split.filter(x => Basics.isObj(x) && x.for === P.hash && x.line === l.id && isAmount(x.amount) && sameKind(x.amount, kindP)).reduce((t, x) => fadd(t, dec(x.amount.value)), F0) : F0), F0);
        const share = fmin(free, fsub(priced.f, labelled).n > 0n ? fsub(priced.f, labelled) : F0);
        const paidL = fadd(labelled, share);
        free = fsub(free, share);
        if (l.per && Basics.isObj(lineTerms.price.amount)) {
          // under a price { amount: a, per: p } the pieces the payments pay for are P times p over a, exact, in `per`'s unit, and they are taken only from what moved in that same unit; under a price of zero, all that moved is paid for
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
  // `uncovered.from` has one entry for each line that moved something (its amount may be 0); payments with no line label cover the lines in the order the terms list them; before a binding
  // accept it is { from: [], to: null }
  out.uncovered = { from: fromUncovered(), to: toUncovered() };
  const uncoveredFact = () => out.uncovered;
  // what is to come, and by the hand-overs of it (promises.md, Handing on a receiving place): null until one is given
  if (toComeActive) {
    const o = toComeLatest();
    out.to_come = { to: o.to.map(x => ({ owner: x.owner, amount: x.amount })), from: o.from.map(x => ({ owner: x.owner, amount: x.amount })), draws: o.draws };
    // a payment made to an owner who had already handed that part of what is to come on, without seeing it, counts; the old owner holds that amount for
    // the new one: [{ from, to, amount, payment }]
    const toComeOn = [];
    for (const x of pays) {
      const owners = toComeSeenBy(x).fromOwners;
      const owner = Check.asList(x.refs.to_owner).find(w => owners.includes(w));
      if (owner === undefined || !isAmount(x.state.amount)) continue;
      const kind = kindOf(x.state.amount);
      let left = Array.isArray(x.state.split) ? x.state.split.filter(e => Basics.isObj(e) && e.for === P.hash && isAmount(e.amount) && sameKind(e.amount, kind)).reduce((t, e) => fadd(t, dec(e.amount.value)), F0) : dec(x.state.amount.value);
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
  out.received_at = pool.all().filter(o => o.type === 'observe' && o.state.kind === 'message' && Check.asList(o.refs.for).includes(P.hash) && Identity.counts(o, pool) && sideOfB(o)).sort(Basics.byHash).map(o => {
    const side = sideOfB(o), ks = Identity.clocksOf(terms.clocks);
    return { message: o.hash, side, at: ks ? (Bytes.receivedAt(o.hash, ks, pool) || null) : null };
  });
  // a new date both sides signed (promises.md, Terms: pay_by): a side's observe of kind message for the deal with a pay_by, answered accepted by an
  // observe of the other side; the agreed dates in the order the answers stand in causal order (ties by hash)
  out.moved = [];
  {
    const found = [];
    for (const p of pool.all()) {
      if (!(p.type === 'observe' && p.state.kind === 'message' && Check.asList(p.refs.for).includes(P.hash) && Basics.isStr(p.state.pay_by) && Check.timeProblem(p.state.pay_by) === null && Identity.counts(p, pool))) continue;
      const side = sideOfB(p);
      if (!side) continue;
      for (const a of D) if (a.type === 'observe' && Check.asList(a.refs.answers).includes(p.hash) && a.state.status === 'accepted' && sideOfB(a) && sideOfB(a) !== side) found.push({ n: pool.past(a.hash).size, h: a.hash, v: { pay_by: p.state.pay_by, proposal: p.hash, answer: a.hash } });
    }
    found.sort((x, y) => x.n - y.n || Basics.cmp(x.h, y.h));
    out.moved = found.map(f => f.v);
  }
  const overAllocated = !!alloc && takers[0] && takers[0].over_allocated === true;
  out.over_allocated = overAllocated;
  const paidAll = computable && (totalF === null || fcmp(paidF, totalF) >= 0);
  // due and paid_at are facts (folds.md): the deal's terms.pay_by, and once the price is paid in full the latest date among the payments, each dated
  // by the first counting answer of the side it is paid to (or a named signer's confirms). Lateness is each reader's judgement.
  // a standing promise is due and paid occurrence by occurrence: its one pay_by and one occurrence's price are never read as the whole,
  // so it reports no due and no paid_at rather than mislead
  const standing = terms.repeat !== undefined;
  // a `when` that follows an event (promises.md, Relative time): after an observe kind that is not an id
  const wh = live.state.when, eventWhen = Basics.isObj(wh) && Basics.isStr(wh.after) && !Check.RX.id.test(wh.after) && wh.wait !== undefined ? wh : null;
  out.due = Basics.isStr(terms.pay_by) && !standing ? terms.pay_by : null;
  const countedAt = b => { const rs = rcvs('from', b, b, true); const dates = [...answersTo(b, 'from', true), ...pool.all().filter(c => Check.asList(c.refs.confirms).includes(b.hash) && namedBy(c) && Identity.counts(c, pool) && rs.some(r => Check.asList(b.refs.to_owner).includes(r)))].map(x => x.state.at).filter(Basics.isStr).sort(); return dates[0]; };
  // a part of the price handed to the one who is to pay it is dated by the owner's accept of the hand-over
  const handedDates = setoff ? toComeLatest().moves.filter(m => m[2] === payer).map(m => pool.all().filter(a => a.type === 'transfer' && a.state.status === 'accepted' && Check.asList(a.refs.answers).includes(m[0])).map(a => a.state.at).filter(Basics.isStr).sort()[0]).filter(Basics.isStr) : [];
  const payDates = [...pays.map(countedAt), ...handedDates].filter(Basics.isStr).sort();
  out.paid_at = !standing && paidAll && total !== null && (pays.length || setoff || receivedFrom.length) && fpos(paidF) && payDates.length ? payDates[payDates.length - 1] : null;
  // a payment names the occurrence it pays (state.occurrence: its start time, or the hash of the observe that started it): occurrences
  // reports each one a payment names or an event started, when it fell due (a start time is its own due; an event's is its observe's at plus the
  // repeat's wait), what was paid for it, and once that covers one occurrence's price, the latest date among its payments
  out.occurrences = [];
  if (standing || eventWhen) {
    const rep = standing ? terms.repeat : eventWhen, wait = Basics.isObj(rep) && Basics.isStr(rep.wait) ? rep.wait : null, byList = Basics.isObj(rep) && Array.isArray(rep.by) ? rep.by.filter(Basics.isStr) : [];
    // an event `when` has no `by`: only the receiving side's ask counts
    const holderOnly = !standing;
    const events = Basics.isObj(rep) && Basics.isStr(rep.after) ? pool.all().filter(o => o.type === 'observe' && o.state.kind === rep.after && Check.asList(o.refs.for).includes(P.hash) && Identity.counts(o, pool) &&
      (holderOnly ? sideOfB(o) === 'to' : (Basics.isObj(rep) && Array.isArray(rep.by) ?
        // the side that charges cannot start a charge alone: only the names in `by` start occurrences (a side counts only if it names itself); with no `by`, none starts one
        (byList.some(n => n === o.refs.author) || (o.refs.as !== undefined && byList.includes(o.refs.as))) : false))) : [];
    // the wait runs from the named clock's receipt of the event (blocks.md), never from its own `at`: the promise's clocks and no one else
    const kclock = Identity.clocksOf(terms.clocks);
    // the occurrences a payment names: a lone state.occurrence, or in a split the occurrence of each part for this deal (a part with none reads the payment's own)
    const occOf = b => (Array.isArray(b.state.split) ? b.state.split.filter(x => Basics.isObj(x) && x.for === P.hash).map(x => (Basics.isStr(x.occurrence) ? x.occurrence : b.state.occurrence)).filter(Basics.isStr) : Basics.isStr(b.state.occurrence) ? [b.state.occurrence] : []);
    const sumFor = (b, name) => (Array.isArray(b.state.split) ? b.state.split.filter(x => Basics.isObj(x) && x.for === P.hash && (Basics.isStr(x.occurrence) ? x.occurrence : b.state.occurrence) === name && isAmount(x.amount) && kindP && sameKind(x.amount, kindP)).reduce((t, x) => fadd(t, dec(x.amount.value)), F0) : kindP ? towardIn(b, 'from', kindP) : F0);
    // an occurrence kept with no price: the doer's own done made for the deal, naming it; the doer is the from side, or whoever it passed the part to
    const dones = pool.all().filter(o => o.type === 'observe' && o.state.kind === 'done' && Basics.isStr(o.state.occurrence) && Check.asList(o.refs.for).includes(P.hash) && partSide(o) === 'from' && Identity.counts(o, pool) && !defeated(o.hash));
    const names = [...new Set([...pays.flatMap(occOf), ...events.map(o => o.hash), ...dones.map(o => o.state.occurrence)])].sort();
    for (const name of names) {
      const ev = events.find(o => o.hash === name);
      const rcv = ev && kclock ? Bytes.receivedAt(ev.hash, kclock, pool) : null;
      const due = ev ? (Basics.isStr(rcv) ? (wait ? Check.addDur(rcv, wait) : rcv) : null) : (Check.timeProblem(name) === null && !Check.RX.hash.test(name) ? name : null);
      const mine = pays.filter(b => occOf(b).includes(name));
      const sum = mine.reduce((t, b) => fadd(t, sumFor(b, name)), F0);
      const paid = !mine.length || !kindP ? null : amtOut(sum, kindP);
      const covered = totalF !== null && fcmp(sum, totalF) >= 0 && fpos(sum);
      const dates = covered ? mine.map(countedAt).filter(Basics.isStr).sort() : [];
      const doneDates = dones.filter(o => o.state.occurrence === name).map(o => o.state.at).filter(Basics.isStr).sort();
      out.occurrences.push({ occurrence: name, due: due === undefined ? null : due, paid, paid_at: dates.length ? dates[dates.length - 1] : null, done_at: doneDates.length ? doneDates[0] : null });
    }
  }
  // a side's defeats of the deal's head (its first promise, its root, or the offer the binding accept answers), or of a block in the deal that speaks
  // for the other side (a delivery, a payment, work), changes nothing: it is shown as disputed, by that side, on the date it gives (promises.md,
  // Disputes). A side's defeats of its own block is no dispute.
  const disputed = [];
  for (const c of pool.all()) {
    const by = Identity.counts(c, pool) ? sideOfB(c) : null;
    if (!by) continue;
    for (const h of Check.asList(c.refs.defeats)) {
      const t = pool.get(h);
      if (!t) continue;
      const head = h === P.hash || h === Q.hash || h === live.hash;
      const tSide = sideOfB(t);
      if (head || (D.some(x => x.hash === h && x.hash !== P.hash) && tSide && tSide !== by)) disputed.push({ hash: c.hash, of: h, by, at: Basics.isStr(c.state.at) ? c.state.at : null });
    }
  }
  out.disputed = disputed.sort((a, b) => Basics.byHash(a, b) || Basics.cmp(a.of, b.of));
  Object.defineProperty(out, 'paidUp', { value: paidAll, enumerable: false }); // compared exactly; the view reads it, never the floats reported
  // which side ended it (folds.md, A promise's stage): the side the stop speaks for, or both when a counted block of the other side confirms the stop (a
  // later stop of their own is not agreement)
  const byOf = st => {
    const side = sideOfB(st), other = side === 'from' ? 'to' : 'from';
    if (side === null) return null;
    const agreed = pool.all().some(c => Check.asList(c.refs.confirms).includes(st.hash) && Identity.counts(c, pool) && sideOfB(c) === other);
    return agreed ? 'both' : side;
  };
  // a standing promise (a repeat) is done occurrence by occurrence, never as a whole: underway until a stop or a close ends it (folds.md)
  if (terms.repeat !== undefined) covered = false;
  const anySettling = [...goods, ...pays, ...works].length > 0; // the seller's transfer that binds the deal is his delivery too; where it lands it counts, and the deal is underway
  // ---- onward stop and occurrences
  const occ = new Set();
  for (const b of D) {
    if (!(b.type === 'promise' && b.state.status === 'stopped' && Basics.isObj(b.state.stop) && Array.isArray(b.state.stop.occurrences) && sideOfB(b))) continue;
    // a pause ends early by its own signer's updates of it, status resumed (promises.md, Answers): the times named at or after its at stand again
    const back = D.filter(r => r.type === 'promise' && r.state.status === 'resumed' && r.refs.updates === b.hash && r.refs.answers === undefined).map(r => Date.parse(r.state.at)).filter(t => !Number.isNaN(t));
    b.state.stop.occurrences.forEach(o => { const t = Check.timeProblem(o) === null ? Date.parse(o) : NaN; if (!(back.some(r => r <= t))) occ.add(o); });
  }
  out.stopped = [...occ].sort();
  // the sides the binding terms say may show the deal (privacy.md, Showing a deal); a deal that says nothing has no `show`
  // ---- the stage: the first of these that holds, from the furthest along back to the start (with no binding accept, above)
  if (covered && paidAll && fpos(paidF) && fcmp(refundedF, paidF) >= 0) out.stage = 'reversed';
  else if (covered && paidAll) out.stage = 'done';
  else if (onwardFirst) {
    // of first stops that do not see each other, speaking for both sides, by is both: no hash decides it (folds.md, A promise's stage). A death ends no
    const firsts = Check.earliest(onward, pool);
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
  const pool = new Check.Pool([first, ...Check.poolOf(blocks).all()]), o = pool.get(v.offer) || first, c = Basics.termsOf(o).condition;
  let word = null;
  if (c !== undefined) { const h = Bytes.conditionHolds(c, pool.all(), opts && opts.now !== undefined ? opts.now : ''); word = h === true ? 'holds' : h === false ? 'not' : 'unread'; }
  // failure spreads visibly (promises.md, The condition fact): a condition that does not hold because the deal it names ended without it (stopped,
  // declined, expired, breached) or itself rests on such a deal names that deal
  const failedOn = (cond, seen) => {
    const key = ['settled', 'paid', 'accepted'].find(k => Basics.isObj(cond) && Basics.isStr(cond[k]));
    if (!key) return null;
    const target = cond[key];
    if (seen.includes(target) || !pool.get(target)) return null;
    seen.push(target);
    const tv = promiseViewBase(pool.get(target), pool.all(), opts);
    if (!tv) return null;
    const ended = ['declined', 'expired'].includes(tv.stage) || (tv.stage === 'stopped' && (tv.stop === 'before' || key !== 'accepted'));
    if (ended) return target;
    const to = pool.get(tv.offer) || pool.get(target), tc = to ? Basics.termsOf(to).condition : undefined;
    if (tc !== undefined && Bytes.conditionHolds(tc, pool.all(), opts && opts.now !== undefined ? opts.now : '') === false && failedOn(tc, seen) !== null) return target;
    return null;
  };
  // which date was missed (promises.md, Terms: pay_by): the dates in force in the order agreed (the first promise's own pay_by, then each date both sides
  // signed) that passed before the price was paid in full, or, while it is unpaid, before the reader's clock; null when it states no pay_by or is standing
  const tt = Basics.termsOf(o);
  let missed = null;
  if (Basics.isStr(tt.pay_by) && tt.repeat === undefined) {
    const dates = [tt.pay_by, ...(v.moved || []).map(m => m.pay_by)];
    const horizon = Basics.isStr(v.paid_at) ? v.paid_at : (opts && Basics.isStr(opts.now) && opts.now !== '' ? opts.now : null);
    missed = dates.filter(d => horizon !== null && d < horizon);
  }
  const out = { ...v, condition: word, condition_failed: word === 'not' ? failedOn(c, [first.hash]) : null, missed };
  if (v.paidUp !== undefined) Object.defineProperty(out, 'paidUp', { value: v.paidUp, enumerable: false });
  return out;
}
function promiseViewBase(first, blocks, opts) {
  const s = promiseStage(first, blocks);
  if (!s || s.not_shown) return s || null;
  const pool = new Check.Pool([first, ...Check.poolOf(blocks).all()]);
  // expired once every live offer has an expires the reader's clock has passed (one still open could bind)
  const past = s.live.length && s.live.every(h => { const o = pool.get(h), exp = o && Basics.termsOf(o).expires; return exp && opts && opts.now !== undefined && opts.now > exp; });
  if ((s.stage === 'offered' || s.stage === 'asked') && past) return { ...s, stage: 'expired' };
  // (folds.md, Views): once the reader's clock is past a promise's `terms.until` and the promise moves nothing, the view says elapsed. A fact of its term, never that it was kept; it binds no one. One a stop ended stays stopped.
  const o = pool.get(s.offer), t = o ? Basics.termsOf(o) : {};
  const running = s.stage === 'accepted' || s.stage === 'underway';
  // "moves nothing" is a fact of its term: it names no `what`, no `lines` and no `quantity` (nothing goes from its signer)
  // it moves something where a line of it names a what or a quantity
  const moves = o && Check.linesOf(t).some(l => l.what !== undefined || l.quantity !== undefined);
  if (running && Basics.isStr(t.until) && opts && Basics.isStr(opts.now) && opts.now !== '' && opts.now > t.until && !moves) {
    const v = { ...s, stage: 'elapsed' };
    Object.defineProperty(v, 'paidUp', { value: s.paidUp, enumerable: false });
    return v;
  }
  return s;
}
// due (view): a relative when is due wait after the anchor arrived on the performer's node, on the performer's clock
function due(promise, arrivals) {
  const w = promise.state.when;
  if (!Basics.isObj(w) || w.after === undefined || w.wait === undefined) return null;
  const at = arrivals && arrivals[w.after];
  return at ? Check.addDur(at, w.wait) : null;
}

// ================================================================ the signer's word and the claim of invasion (promises.md, Disputes)
// the words beside a block: an observe of kind not_free naming it in refs.subject, counting as hers only when written by the block's author
function notFreeShown(blockIn, blocks) {
  const pool = Things.withThing(blockIn, blocks);
  const block = pool.get(typeof blockIn === 'string' ? blockIn : blockIn.hash) || blockIn;
  const words = pool.all().filter(b => b.type === 'observe' && b.state.kind === 'not_free' && b.state.status === undefined && b.refs.subject === block.hash && Identity.counts(b, pool)).sort(Basics.byHash);
  const shown = [], nothing = [];
  for (const n of words) {
    if (Basics.isStr(block.refs.author) && Consent.backedIn(n, block.refs.author, pool).backed) shown.push({ block: n.hash, by: n.refs.author, reason: Basics.isStr(n.state.reason) ? n.state.reason : null, threat: Basics.isStr(n.state.threat) ? n.state.threat : null, at: Basics.isStr(n.state.at) ? n.state.at : null });
    else nothing.push({ block: n.hash, why: 'not_signer' });
  }
  return { shown, nothing };
}
// who holds a claim now: the claimant, then each hand-over (a transfer naming the claim in refs.what, signed by the holder where it stands, accepted by the new holder, and signed
// twice: blocks.md, Finality). A claim is one whole (folds.md, What is left); a hand-over is a draw on it. Two by one holder that do not see each other are a pair, and neither moves it.
function claimHolder(claim, claimant, pool) {
  const draws = [];
  for (const t of pool.all()) {
    if (t.type !== 'transfer' || t.state.status !== undefined || t.refs.answers !== undefined || !Check.asList(t.refs.what).includes(claim.hash) || t.refs.to_owner === undefined || Identity.voided(t, pool) || !pool.sees(t.hash, claim.hash)) continue;
    const sp = Things.speakerOf(t, pool); if (!Basics.isStr(sp)) continue;
    draws.push({ block: t, by: sp, to: Check.asList(t.refs.to_owner)[0], amount: null, lands: 'accept', stays: true, kind: 'transfer' });
  }
  const r = Things.drawsOn(pool, { kind: null, said: false, byUnit: false, firsts: [{ owner: claimant, start: claim, f: Things.WHOLE }], adds: [] }, draws, { seen: () => true });
  if (r.not_shown) return claimant;
  const owners = [...r.owners.entries()].filter(([, f]) => fpos(f)).map(([o]) => o);
  // who holds a claim now: the one owner of the claim (a hand-over that landed); else, while a hand-over is given or a pair stands, the owner it was drawn from; else the claimant
  if (owners.length === 1) return owners[0];
  const by = [...new Set(r.entries.filter(e => e.takes).map(e => e.by))];
  return by.length === 1 ? by[0] : claimant;
}
function invasionShown(claimIn, blocks) {
  // a claim is its signer's word that something is hers, or that she or what is hers was crossed: an `observe` naming in `refs.subject` what it is about, in `refs.to` whom she says did it or holds it, in `refs.derives_from` what she shows. (the text does not say; read so)
  // No fold reads its truth. What is shown is who speaks, who holds it now, the evidence, the judges named for it and their words.
  const pool = Things.withThing(claimIn, blocks);
  const claim = pool.get(typeof claimIn === 'string' ? claimIn : claimIn.hash) || claimIn;
  if (claim.type !== 'observe' || claim.state.kind !== 'invasion') return null;
  const ch = claim.hash;
  const claimant = Things.speakerOf(claim, pool);
  const accused = [...new Set(Check.asList(claim.refs.to))].sort();
  const evidence = [...new Set(Check.asList(claim.refs.derives_from))].sort();
  const holder = claimant === null ? null : claimHolder(claim, claimant, pool);
  const sideOfClaim = w => claimant === w || holder === w;
  const isAccused = w => accused.includes(w);
  const named = [];
  for (const g of pool.all().filter(g => namesJudge(g, ch) && Identity.counts(g, pool))) {
    const judge = g.state.judge, signer = Things.speakerOf(g, pool);
    if (!Basics.isStr(judge) || signer === null) continue;
    if (!(sideOfClaim(signer) || isAccused(signer))) continue;
    if (sideOfClaim(judge) || isAccused(judge)) continue;
    named.push({ judge, signer, grant: g.hash });
  }
  const judgeKeys = [...new Set(named.map(n => n.judge + '\u0000' + n.signer))].sort();
  const judges = judgeKeys.map(k => { const [judge, signer] = k.split('\u0000'); return { judge, signer }; });
  const rulings = [];
  for (const r of pool.all().filter(r => Identity.counts(r, pool))) {
    for (const word of ['confirms', 'defeats']) {
      if (!Check.asList(r.refs[word]).includes(ch)) continue;
      const signer = r.refs.author; if (!Basics.isStr(signer)) continue;
      // the judge is whom the ruling speaks for: a circle named as judge rules by its holders of sign, signing as it (circles.md)
      const sp = Things.speakerOf(r, pool);
      const author = sp !== null ? sp : signer;
      if (sideOfClaim(signer) || isAccused(signer) || sideOfClaim(author) || isAccused(author)) continue;
      const by = [...new Set(judges.filter(j => j.judge === author).map(j => j.signer))].sort();
      if (!by.length) continue;
      rulings.push({ block: r.hash, judge: author, named_by: by, word, evidence: [...new Set(Check.asList(r.refs.derives_from))].sort() });
    }
  }
  rulings.sort((a, b) => Basics.cmp(a.block, b.block) || Basics.cmp(a.word, b.word));
  return { claimant, holder, evidence, judges: judges.map(j => ({ judge: j.judge, named_by: j.signer })), rulings };
}


// ================================================================ a pot (folds.md, A pot)
function signalBy(c) {
  if (!Basics.isObj(c)) return null;
  if (c.signal !== undefined && Basics.isObj(c.by) && Array.isArray(c.by.names)) return c.by.names.filter(Basics.isStr);
  const inner = c.within !== undefined ? c.within : c.without;
  return inner === undefined ? null : signalBy(inner);
}
// A pot is one measure whose owner is the holder (whom the head speaks for): `terms.backing` her own word, an amount, plus the pay-ins she accepted. A payout is a draw on it.
function potFold(headIn, blocks, now) {
  const pool = Things.withThing(headIn, blocks);
  // a fold reads only what is valid and read (folds.md): a head not given as a valid block is no pot
  const head = pool.get(typeof headIn === 'string' ? headIn : headIn.hash);
  if (!head || head.type !== 'promise' || head.refs.answers !== undefined) return null;
  const holder = Things.speakerOf(head, pool); if (holder === null) return null;
  // a block given and not read that could name the pot hides it; one given only as its header on the
  // holder's line after the head could name it too. The answer is not shown, those blocks in `lacks`
  {
    const hide = new Set();
    for (const e of pool.all()) if (e.type === undefined && e._body && Check.namedIds(e._body).includes(head.hash)) hide.add(e.hash);
    for (const e of pool.unjudged || []) if (Check.namedIds(e).includes(head.hash)) hide.add(e.hash);
    for (const e of pool.all()) if (e.type === undefined && !e._body && Basics.isStr(e.refs.author) && e.refs.author === head.refs.author && Identity.signerKeyOf(e, pool) === keyOf(head) && (e.state.seq || 0) > (head.state.seq || 0)) hide.add(e.hash);
    if (hide.size) return { not_shown: true, lacks: [...hide].sort() };
  }
  const terms = Basics.isObj(head.state.terms) ? head.state.terms : {};
  const backing = isAmount(terms.backing) ? terms.backing : null;
  const noLimit = backing === null && terms.cap === 'all';
  // the holder's accept of a pay-in is his word that the money came ("paid only by the payee's word"), and a block of a fork binds its signer as what he is to pay (Rule B, folds.md A fork is a burden): a pay-in he accepted by a block of a fork counts (it binds him). The pot's holder never gains by it: it is backing he must pay out (the text does not say; read so)
  const acceptsOf = t => pool.all().filter(a => a.type === 'transfer' && a.state.status === 'accepted' && Check.asList(a.refs.answers).includes(t.hash) && Identity.binds(a, pool) && Check.asList(t.refs.to_owner).includes(Things.speakerOf(a, pool)) && Things.answerStands(t, a, pool));
  const base = t => t.type === 'transfer' && t.state.status === undefined && t.refs.answers === undefined && Check.asList(t.refs.for).length === 1 && Check.asList(t.refs.for)[0] === head.hash && Identity.counts(t, pool) && pool.sees(t.hash, head.hash);
  // the pay-ins: transfers for the head to_owner the holder, each counted for a payout when her accept of it is in the payout's causal past
  const ins = pool.all().filter(t => base(t) && isAmount(t.state.amount) && t.refs.to_owner === holder && t.refs.what === undefined && acceptsOf(t).length).sort(Basics.byHash);
  // the pot's kind: the backing's; with none, the one kind every accepted pay-in shares; else it has none and pays nothing out
  let kind = null;
  if (backing) kind = kindOf(backing);
  else if (ins.length && ins.every(t => sameKind(t.state.amount, ins[0].state.amount))) kind = kindOf(ins[0].state.amount);
  // with a cap of `all` and neither, the one kind the holder's own payouts share (her word states it); several: none
  else if (!ins.length && noLimit) {
    const outs = pool.all().filter(t => base(t) && isAmount(t.state.amount) && t.refs.what === undefined && Check.asList(t.refs.to_owner).length === 1 && t.refs.to_owner !== holder);
    if (outs.length && outs.every(t => sameKind(t.state.amount, outs[0].state.amount))) kind = kindOf(outs[0].state.amount);
  }
  const schema = Basics.isStr(head.refs.schema) ? pool.get(head.refs.schema) : null;
  const bench = schema && Basics.isObj(schema.state.grounds) && Basics.isObj(schema.state.grounds.bench) ? Check.asList(schema.state.grounds.bench.names) : [];
  // a vouch to whoever holds a lot (promises.md, Bearer): when the head's receiver is a thing, a payout counts as the claim of its owner where the payout stands
  const lot = Basics.isStr(head.refs.to) && pool.get(head.refs.to) && pool.get(head.refs.to).type === 'thing' ? head.refs.to : null;
  const made = lot === null ? null : Things.madeFromList(lot, pool);
  const draws = [], listed = [];
  for (const t of pool.all().filter(base)) {
    const to = Check.asList(t.refs.to_owner);
    if (!isAmount(t.state.amount) || to.length !== 1 || to[0] === holder || t.refs.what !== undefined || Things.speakerOf(t, pool) !== holder) continue;
    if (!fpos(dec(t.state.amount.value))) continue; // a payout of zero is no draw
    const by = t.state.condition === undefined ? null : signalBy(t.state.condition);
    let why = null;
    if (bench.length && !(by && by.length && by.every(b => bench.includes(b)))) why = 'not_confirmed';
    else if (lot !== null) {
      if (made.not_shown) return made;
      const past = pool.past(t.hash), parts = [lot, ...made.map(x => x.thing)];
      if (!parts.some(x => (x === lot || past.has(x)) && Things.ownershipFold(x, pool, past).owners.some(o => o.owner === to[0]))) why = 'not_holder';
    }
    // neither takes or holds anything of the pot: it is the holder's own word from her own goods
    if (why) { listed.push({ block: t.hash, by: holder, to: to[0], amount: { ...t.state.amount }, takes: false, why, state: null }); continue; }
    draws.push({ block: t, by: holder, to: to[0], amount: t.state.amount, lands: 'accept', stays: false, kind: 'payout', cond: t.state.condition !== undefined ? t : undefined });
  }
  // a pot with no kind (two kinds of pay-in and no backing, or nothing) gives null sums and every payout reads `unit`; a pot with a kind and no backing states `backing` 0; a pot whose cap is `all` takes every payout
  const measure = { kind, said: !!kind, noKind: !kind, byUnit: false, unlimited: noLimit, firsts: [{ owner: holder, start: head, f: backing ? dec(backing.value) : F0 }],
    // a pay-in counts for a payout when the holder's accept of it, by any key of hers, is in the payout's causal past (the accept hashes are the pay-in's `at`)
    adds: kind ? ins.filter(t => sameKind(t.state.amount, kind)).map(t => ({ owner: holder, f: dec(t.state.amount.value), at: acceptsOf(t).map(a => a.hash) })) : [] };
  const r = Things.drawsOn(pool, measure, draws, { seen: () => true, now });
  if (r.not_shown) return { not_shown: true, lacks: r.lacks };
  let paidOut = F0;
  for (const row of r.rows.values()) if (row.takes && row.landed) paidOut = fadd(paidOut, row.amount);
  const paidIn = fsumF(measure.adds.map(a => a.f));
  const out = f => (kind ? amtOut(f, kind) : null);
  const left = r.owners.get(holder) || F0;
  const payouts = [...r.entries, ...listed].sort((a, b) => Basics.cmp(a.block, b.block));
  return { holder, kind: kind ? { ...kind } : null, backing: noLimit ? null : backing ? { ...backing } : kind ? out(F0) : null, paid_in: out(paidIn), held: out(r.held), paid_out: out(paidOut), left: noLimit ? null : out(left), cap: noLimit ? 'all' : null, payouts };
}
Object.assign(module.exports, { namesJudge, dec, F0, frac, fadd, fsub, fmul, fcmp, fmin, fpos, fsumF, fnorm, decCmp, fText, kindOf, sameKind, fPrint, amtOut, isAmount, totalOf, termsTotalF, termsTotal, reliedOn, promiseStage, stageBinds, promiseView, promiseViewBase, due, notFreeShown, claimHolder, invasionShown, potFold });
