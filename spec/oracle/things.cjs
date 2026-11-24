'use strict';
// The oracle's part for things (things.md; folds.md, What is left): what is left, ownership and place, shares and uses.
const Basics = require('./basics.cjs');
const Bytes = require('./bytes.cjs');
const Check = require('./check.cjs');
const Circles = require('./circles.cjs');
const Deals = require('./deals.cjs');
const Grants = require('./grants.cjs');
const Identity = require('./identity.cjs');
// ================================================================ what is left (folds.md, What is left): ONE function counts everything that is drawn on
// A measure is an amount its owner stated. What each owner owns of it is drawn on along one line, in `seq` order, against a running amount; a draw holds from where it is
// signed, lands on the receiver's yes, is freed by her no or an end she has seen; one that does not fit takes nothing and is never cut down. Six readers (the ownership of an
// instance, a claim handed on, what is to come to a side, an open offer's allocations, a pot's payouts, and a grant's part) say only what states the measure, who owns it first and what
// draws on it; they call this and nothing else. No fold compares every pair of draws; none orders by the size of a block's past, by a hash or by arrival.
// measure: { kind: { unit, of } | null, said: boolean, byUnit: boolean, unlimited?: boolean,
// firsts: [{ owner, start: block|null, f: fraction, key?: line }], adds: [{ owner, f, at: hash }] }
// kind null / said false: one whole, or an amount not said: a draw states no amount (no_measure) and takes all its owner owns of it.
// byUnit: an instance's kind is the unit of its pack (a draw carries no `of`); otherwise unit and of both.
// adds: pay-ins, plain sums added to an owner's first line for the draws that have `at` in their causal past (the pot).
// draw: { block, by, to (id | 'open' | null), amount (amount | null = all), lands: 'accept' | 'stands' | 'at once' | 'never', stays: bool (what lands is still in the measure),
// key?: line (a grant's part), freers?: [hash] (blocks that free it besides the receiver's no), pass?: { owner, key } (the part a grant passes), cond?: transfer }
// Returns { not_shown, lacks, draws: [entry], rows: Map(hash -> row), holdings, owners, held, ended, let_go }.
let UNIQ = 0;
let WALKED = null; // when a set: the blocks every line a fold reads runs through (exportOf collects them: nodes.md, Her record at a host)
const idOfSet = new WeakMap();
const setId = s => { if (!idOfSet.has(s)) idOfSet.set(s, ++UNIQ); return idOfSet.get(s); };
function drawsOn(pool, measure, drawList, opts) {
  const seen = (opts && opts.seen) || (() => true), now = (opts && opts.now) || '';
  const forkset = Identity.equivocated(pool);
  const ownKeyOf = b => { const k = Identity.signerKeyOf(b, pool); return k === null || k === undefined ? '' : k; };
  // a line goes on past a key replacement: a key grant that names in `state.counted_to` the last block of the old key that counts continues that key's line on the new key
  const keyOfB = b => {
    for (let hops = 0; hops < 16; hops++) {
      const kg = Basics.isStr(b.refs.key) ? pool.body(b.refs.key) : null;
      const x = kg && Basics.isStr(kg.state.counted_to) ? pool.get(kg.state.counted_to) : null;
      if (!x || !Basics.isObj(x.refs) || x.refs.author !== b.refs.author || ownKeyOf(x) === ownKeyOf(b)) break;
      b = x;
    }
    return ownKeyOf(b);
  };
  const seqOf = b => (Number.isInteger(b.state.seq) ? b.state.seq : 0);
  const ptl = h => pool.past(h);
  const lacksAll = [];
  const sayKeys = new WeakMap(); // the keys already said, per list, so each new one is checked once
  const say = (arr, x) => { const k = Bytes.jcs(x); let ks = sayKeys.get(arr); if (!ks) { ks = new Set(arr.map(y => Bytes.jcs(y))); sayKeys.set(arr, ks); } if (!ks.has(k)) { ks.add(k); arr.push(x); } };
  // ---- the receiver's no, and an end of the draw she has seen
  const ansIdx = new Map();
  for (const a of pool.all()) if (seen(a.hash) && a.refs && a.refs.answers !== undefined) for (const h of Check.asList(a.refs.answers)) { if (!ansIdx.has(h)) ansIdx.set(h, []); ansIdx.get(h).push(a); }
  const answersTo = d => (ansIdx.get(d.block.hash) || []).filter(a => Identity.counts(a, pool));
  const answersFor = h => (ansIdx.get(h) || []).filter(a => Identity.counts(a, pool));
  const stopIdx = new Map();
  for (const w of pool.all()) if (seen(w.hash) && w.state && w.state.status === 'stopped' && w.refs && w.refs.updates !== undefined) { if (!stopIdx.has(w.refs.updates)) stopIdx.set(w.refs.updates, []); stopIdx.get(w.refs.updates).push(w); }
  let bySpeaker = null;
  const speakerBlocks = id => { if (!bySpeaker) { bySpeaker = new Map(); for (const b of pool.all()) if (seen(b.hash) && b.refs && Identity.counts(b, pool)) { const sp = speakerOf(b, pool); if (sp !== null && sp !== undefined) { if (!bySpeaker.has(sp)) bySpeaker.set(sp, []); bySpeaker.get(sp).push(b); } } } return bySpeaker.get(id) || []; };
  // her `declined` or `stopped` answer to the draw, to the deal it is `for`, or her counter to the offer that is the draw
  // her no: her `declined` or `stopped` answer (folds.md, Freed); an observe that answers it says it as well as a block of its own type (things.md, Letting go)
  const isNo = a => (a.state.status === 'declined' || a.state.status === 'stopped') && (a.type === 'transfer' || a.type === 'promise' || (a.type === 'observe' && a.refs.answers !== undefined));
  // the giver's own end of a transfer: her counted stop (an updates of it, stopped); a time it states (expires) is read only against the receiver's own dated word (blocks.md, Time)
  const stopsOf = d => (stopIdx.get(d.block.hash) || []).filter(w => w.type === d.block.type && Identity.counts(w, pool) && speakerOf(w, pool) === d.by);
  // her close is an end by its giver of every standing word of hers but a will (a transfer on `{ closed: <her id> }`)
  const endsOf = d => [...stopsOf(d), ...((Basics.isObj(d.block.state.condition) && d.block.state.condition.closed !== undefined) ? [] : (Identity.identityFold(d.by, pool).closes || []).filter(c => seen(c)).map(c => pool.get(c)).filter(Boolean))];
  const expiresOf = d => (d.block.type === 'transfer' && Basics.isStr(d.block.state.expires) ? d.block.state.expires : d.block.type === 'promise' && Basics.isStr(Basics.termsOf(d.block).expires) ? Basics.termsOf(d.block).expires : null);
  // a time a word states is an end of that word. On a clock the word names, its clocks' cutoffs show it; with none, an accept is in time only by its own `at`, before the end. An accept at or after the end, or with no `at`, is not in time:
  // it binds its giver only by her own later block that says yes to it (her `accepted` answer to it, or a block that performs the deal: a transfer `for` it, or her accepted answer
  // to one), or by a relier's block that has it in its causal past; a stop, a decline, or her block that only has it in its past binds her to nothing (blocks.md, Time)
  const clocksOfDraw = d => (d.block.type === 'promise' ? Identity.clocksOf(Basics.termsOf(d.block).clocks) : d.block.type === 'transfer' && d.block.state.clocks !== undefined ? Identity.clocksOf(d.block.state.clocks) : null);
  const acceptInTime = (d, a) => { const exp = expiresOf(d); if (exp === null) return true; const ks = clocksOfDraw(d); return ks ? Bytes.inTimeByClock(a.hash, ks, pool, exp) : Basics.isStr(a.state.at) && a.state.at < exp; };
  const actedOnLate = (d, a) => {
    const dealIds = [d.block.hash, ...Check.asList(d.block.refs.for)], forDeal = t => !!t && t.type === 'transfer' && t.state.status === undefined && Check.asList(t.refs.for).some(f => dealIds.includes(f));
    return pool.all().some(x => seen(x.hash) && x !== a && Basics.isStr(x.refs.author) && speakerOf(x, pool) === d.by && Identity.counts(x, pool) && ptl(x.hash).has(a.hash) && ((x.state.status === 'accepted' && (Check.asList(x.refs.answers).includes(a.hash) || forDeal(pool.get(Check.asList(x.refs.answers)[0])))) || forDeal(x)));
  };
  const yesOf = (d, a) => a.state.status === 'accepted' && speakerOf(a, pool) === d.to && (a.type !== 'transfer' || answerStands(d.block, a, pool)) && (acceptInTime(d, a) || actedOnLate(d, a) || Deals.reliedOn(a, pool));
  // the blocks that free a draw, for the draws that have one in their causal past: the receiver's no that has none of her yes in its past, and her block that has seen an end
  // (a stop of the giver's that has none of her yes in its past; a time she dates past `expires`) before any yes
  const freersOf = d => {
    const memo = d._freers; if (memo) return memo;
    const out = new Set(d.freers || []);
    if (d.to !== null && d.to !== undefined && d.to !== 'open') {
      const mine = speakerBlocks(d.to);
      const yeses = answersTo(d).filter(a => yesOf(d, a)).map(a => a.hash);
      const noYesIn = b => !yeses.some(y => ptl(b.hash).has(y));
      // her own no frees the draw whether or not her yes came before (it is hers to give up until it lands); an end by its giver with her yes in its past frees nothing
      for (const a of answersTo(d)) if (isNo(a) && speakerOf(a, pool) === d.to) out.add(a.hash);
      for (const fh of Check.asList(d.block.refs.for)) for (const a of answersFor(fh)) if (isNo(a) && speakerOf(a, pool) === d.to) out.add(a.hash);
      if (d.block.type === 'promise') {
        // an offer that is a draw is freed exactly where the accept that answers it does not bind: the giver's decline of that accept; her counter to the offer is her no
        for (const a of answersTo(d)) {
          if (a.type === 'promise' && a.state.status === undefined && speakerOf(a, pool) === d.to) out.add(a.hash); // her counter (a promise that answers the offer) frees it (the text does not say; read so)
          for (const x of answersFor(a.hash)) if (x.state.status === 'declined' && speakerOf(x, pool) === d.by) out.add(x.hash);
        }
      }
      // where a draw's landing waits on payment (`terms.waits_on: price`), its signer's end frees it where no block of his side accepting a payment toward the price is in the end's causal past
      // "a block of his side accepting a payment toward the price" is his counted `accepted` answer to a block `for` the deal, or his `received` of one; the deal is the draw's own offer or the deal it is `for` (the text does not say; read so)
      if (waitsOnPrice(d)) {
        const deals = new Set([d.block.hash, ...Check.asList(d.block.refs.for)]);
        const paidIn = e => pool.all().some(x => seen(x.hash) && Identity.counts(x, pool) && ptl(e.hash).has(x.hash) && speakerOf(x, pool) === d.by && ((x.state.status === 'accepted' && Check.asList(x.refs.answers).some(h => { const t = pool.get(h); return !!t && t.hash !== d.block.hash && t.type === 'transfer' && Check.asList(t.refs.for).some(f => deals.has(f)); })) || (x.type === 'observe' && x.state.kind === 'received' && Check.asList(x.refs.for).some(f => deals.has(f)))));
        for (const e of endsOf(d)) if (!paidIn(e)) out.add(e.hash);
      }
      // her close is an end by its giver of every standing word of hers but a will, read as any end of hers (endsOf)
      const ends = endsOf(d).filter(w => noYesIn(w));
      // the clock path: where the draw names a clock (an offer's `terms.clocks`, a transfer's `state.clocks`), an end by its giver that has
      // no yes of hers in its past frees it once the lines that read no (`names` less `needed`, plus one) hold the end with no yes before it
      { const ks = clocksOfDraw(d); if (ks && yeses.length) for (const e of ends) if (yeses.every(y => Bytes.endFirstOn(y, e.hash, ks, pool))) out.add(e.hash); }
      for (const e of ends) for (const b of mine) if (b.hash !== e.hash && ptl(b.hash).has(e.hash) && noYesIn(b)) out.add(b.hash);
      // a time a draw states (`expires`) is an end of it and frees nothing by a date: it is read in `yesOf` (an accept not in time is no yes)
    }
    d._freers = out;
    return out;
  };
  // the terms of the draw's own offer, or of the deal it is `for` (the first promise)
  const waitsOnPrice = d => { const t = b => b && b.type === 'promise' && Basics.isObj(b.state.terms) && b.state.terms.waits_on === 'price'; return t(d.block) || Check.asList(d.block.refs.for).some(h => t(pool.get(h))); };
  // a condition that can no longer hold, by the signed words and clock it names, frees what it held, for its giver's later draws that have that in their past
  const deadMemo = new Map();
  const deadIn = (d, past) => {
    if (!d.cond) return false;
    const k = d.block.hash + '|' + (past ? setId(past) : '');
    if (!deadMemo.has(k)) deadMemo.set(k, Bytes.conditionDead(d.block.state.condition, pool.all().filter(b => seen(b.hash) && (!past || past.has(b.hash)))));
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
  // a line is read in `prev` order; a block out of its place takes nothing; the draws of a pair on this measure are decided together; a later block of a
  // key whose pair did not fit reads `pair`. `pairLines` is the lines whose pair is unresolved: their signer's amount is no one's while it is.
  let forkedLines = new Set();
  const pairInfo = []; // [{ line, members: [{ draw, to, yes }] }] of the pairs left standing in the last pass
  const lineI = Identity.lineInfoOf(pool);
  const pairsAll = Identity.forkPairs(pool);
  const parent = new Map(); // union of the pair stars: block hash -> root
  const find = h => { while (parent.has(h) && parent.get(h) !== h) h = parent.get(h); return h; };
  for (const [x, y] of pairsAll) { if (!parent.has(x)) parent.set(x, x); if (!parent.has(y)) parent.set(y, y); parent.set(find(y), find(x)); }
  function evaluate(holdings) {
    forkedLines = new Set(); pairInfo.length = 0;
    const rows = new Map(), byLine = new Map();
    for (const d of drawList) {
      // a block of a tool of hers that speaks for her (under her grant) is read on the part she passed to that tool, where one was passed
      if (d.ownKey === undefined) d.ownKey = d.key !== undefined ? d.key : null;
      d.key = d.ownKey !== null ? d.ownKey : Basics.isStr(d.by) && d.block.refs.under !== undefined && d.block.refs.author !== d.by && holdings && holdings.has(lineId(d.by, 'pass:' + d.block.refs.author)) ? 'pass:' + d.block.refs.author : keyOfB(d.block);
      // a draw that speaks for a circle is counted on the circle's line: the meter's where it names one; with none, the line of the key that signed the circle's start for the measure, which another key's block joins only by a
      // block that names in `state.counted_to` the last block of that line that counts (A chain goes on)
      if (Basics.isStr(d.by) && d.block.refs.as === d.by) {
        if (circleLineOf(d.by)) { d.key = 'circle'; d.mseq = meterPlace(circleLineOf(d.by), d.block.hash); }
        else if (Basics.isStr(d.block.state.counted_to)) { const X = pool.get(d.block.state.counted_to); if (X && ptl(d.block.hash).has(X.hash) && holdings && holdings.has(lineId(d.by, ownKeyOf(X)))) d.key = ownKeyOf(X); }
      }
      if (d.kind === 'allocation') continue; // read together below
      if (d.will) continue; // a will holds nothing in life; at her close it takes in the order of her line, after what was drawn (read below)
      const lk = d.by + '\u0000' + d.key;
      if (!byLine.has(lk)) byLine.set(lk, []);
      byLine.get(lk).push(d);
    }
    // ---- allocations the record does not order are counted together. An allocation is counted against another only where the other is in its causal past; allocations none of which is in another's
    // past (the phone's and the till's) come to more than what is left: none of them takes, each is shown past (over_allocated) and still binds its signer
    { const allocs = drawList.filter(d => d.kind === 'allocation');
      if (allocs.length) {
        const holding = [...holdings.values()].find(h => h.owner === allocs[0].by), total = holding ? Deals.fsumF(holding.incs.map(i => i.f)) : Deals.F0;
        const taken = [];
        let remaining = allocs.slice();
        while (remaining.length) {
          const mins = remaining.filter(a => !remaining.some(b => b !== a && ptl(a.block.hash).has(b.block.hash)));
          const availFor = a => { let v = total; for (const t of taken) if (ptl(a.block.hash).has(t.d.block.hash) && !freedFor(t.d, a)) v = Deals.fsub(v, t.amount); return v; };
          const want = a => (a.amount ? Deals.dec(a.amount.value) : availFor(a));
          let ok = !!holding;
          const clusterSum = Deals.fsumF(mins.map(want));
          for (const a of mins) if (Deals.fcmp(clusterSum, availFor(a)) > 0 && !measure.unlimited) ok = false;
          if (mins.length === 1 && !holding) ok = false;
          for (const a of mins) {
            const row = { d: a, takes: ok && Deals.fpos(want(a)), why: ok && Deals.fpos(want(a)) ? null : (holding ? 'past' : 'not_owner'), amount: ok && Deals.fpos(want(a)) ? want(a) : null, landed: false, wait: [] };
            rows.set(a.block.hash, row);
            if (row.takes) taken.push(row);
          }
          remaining = remaining.filter(a => !mins.includes(a));
        }
      } }
    for (const [lk, list] of byLine) {
      // a fold reads a line in `prev` order; `seq` numbers the line and never orders it. Blocks of one depth (the branches of a pair) are decided together, never by their hash
      const continued = d => ownKeyOf(d.block) !== d.key; // a block of the new key that goes on the old key's line comes after the old key's blocks
      list.sort((x, y) => (continued(x) ? 1 : 0) - (continued(y) ? 1 : 0) || ((x.mseq === null || x.mseq === undefined ? Infinity : x.mseq) === (y.mseq === null || y.mseq === undefined ? Infinity : y.mseq) ? 0 : (x.mseq === null || x.mseq === undefined ? Infinity : x.mseq) < (y.mseq === null || y.mseq === undefined ? Infinity : y.mseq) ? -1 : 1) || lineI.of(x.block).depth - lineI.of(y.block).depth || Basics.cmp(x.block.hash, y.block.hash));
      const holding = holdings.get(lk);
      const owner = list[0].by;
      let hard = Deals.F0; const soft = []; // what earlier draws on this line took: a sum, and the few that a no, an end or a part-accept may free
      const done = new Set();
      let conflict = false; // a pair on this line that does not fit stands unresolved
      let lingering = Deals.F0; // what the pair's draws that did not take come to: it stays out of what the new key may draw on, until the pair ends
      // one draw read against the running amount, with nothing changed: its row (takes, why, landed...)
      const readOne = d => {
        const row = { d, takes: false, why: null, amount: null, landed: false, wait: [] };
        const past = ptl(d.block.hash);
        const place = lineI.of(d.block);
        if (place.s === 'out_of_place') { row.why = 'out_of_place'; return row; } // a block out of its place takes nothing and binds its signer as a block of a fork does
        // a draw on no line of its key takes nothing (`not_on_chain`), and that is its answer, read before whose the measure is
        if (place.s === 'off') { row.why = 'not_on_chain'; return row; }
        // she owns some of it where the draw stands, but on another line (or on none): not_on_chain; none at all there: not_owner
        // (an amount that came by a draw counts where that draw is in the past)
        const ownsHere = [...holdings.values()].some(h => h.owner === owner && h.incs.some(i => (i.seen ? past.has(i.seen) || i.seen === d.block.hash : i.at === null || (Array.isArray(i.at) ? i.at.some(x => past.has(x) || x === d.block.hash) : past.has(i.at) || i.at === d.block.hash))));
        // an answer never says "nobody" where it turns on a block not given: a draw by one who owns some of the measure somewhere, whose own
        // line back from it lacks a block (what she owned there could be in it), is not shown, never not_owner
        const ownsAnywhere = [...holdings.values()].some(h => h.owner === owner);
        const lacksBack = () => { if (!ownsAnywhere) return []; const w = Identity.walkLine(pool, d.block.hash, null, opts && opts.asked); return w.lacks.filter(l => typeof l !== 'string' || !pool.get(l)); };
        if (!holding && !ownsHere) { const l = lacksBack(); if (l.length) { for (const x of l) say(lacksAll, x); row.why = 'not_shown'; return row; } }
        if (!holding) { row.why = ownsHere ? 'not_on_chain' : 'not_owner'; return row; }
        // the line is read whole from the draw back to her start (folds.md, A chain)
        if (holding.start && holding.start.hash !== d.block.hash && keyOfB(holding.start) === d.key && (place.s === 'on' || place.s === 'hole' || place.s === 'out_of_place' || seqOf(d.block) > seqOf(holding.start) || true)) {
          const w = Identity.walkLine(pool, d.block.hash, holding.start.hash, opts && opts.asked);
          if (WALKED) for (const h of w.path) WALKED.add(h);
          if (opts && opts.read) for (const h of w.path) opts.read.add(h);
          if (w.lacks.length) { for (const l of w.lacks) say(lacksAll, l); row.why = 'not_shown'; return row; }
          if (!w.reached) { row.why = ownsHere ? 'not_on_chain' : 'not_owner'; return row; } // one who owns none of it where the draw stands: not_owner
        }
        const atOk = at => at === null || (Array.isArray(at) ? at.some(x => past.has(x)) : past.has(at));
        // whether a draw takes is read from its own causal past and nothing else: an amount that came to her counts only where the draw that brought it is in the past
        const incs = holding.incs.filter(i => atOk(i.at) && (!i.seen || i.seen === d.block.hash || past.has(i.seen)) && (i.cond === undefined || condHeldIn(i.cond, past)));
        // a draw by one who owns none of the measure where it stands is `not_owner`; one who owns some there on another line, or on none (two accepts apart, vector 36), is `not_on_chain`
        if (!incs.length && !ownsHere) { const l = lacksBack(); if (l.length) { for (const x of l) say(lacksAll, x); row.why = 'not_shown'; return row; } }
        if (!incs.length) { row.why = ownsHere ? 'not_on_chain' : 'not_owner'; return row; }
        const total = Deals.fsumF(incs.map(i => i.f));
        let avail = Deals.fsub(total, hard);
        for (const t of soft) avail = Deals.fsub(avail, drawnBy(t, d));
        if (continued(d)) avail = Deals.fsub(avail, lingering);
        // the hold of the offer this transfer performs is out of what is left; the transfer takes it over
        if (d.performs) { const orow = rows.get(d.performs.block.hash); if (orow && orow.takes && !orow.superseded) avail = Deals.fadd(avail, drawnBy(orow, d)); }
        row.avail = avail;
        if (d.amount && !measure.unlimited) {
          if (measure.noKind) { row.why = 'unit'; return row; }
          if (!measure.said) { row.why = 'no_measure'; return row; }
          if (!(measure.byUnit ? d.amount.unit === measure.kind.unit && !('of' in d.amount) : Deals.sameKind(d.amount, measure.kind))) { row.why = 'unit'; return row; }
        }
        const want = d.amount ? Deals.dec(d.amount.value) : avail;
        // it would fit once an end she has not seen frees an earlier draw: waiting, never past (folds.md, What is left)
        const freedIfSeen = () => { let more = Deals.F0; for (const t of soft) if (!t.landed && freersOf(t.d).size === 0 && endIn(t.d, past)) more = Deals.fadd(more, t.amount); return more; };
        if (!Deals.fpos(want)) {
          if (!d.amount && Deals.fpos(freedIfSeen())) { row.why = null; row.wait.push({ block: d.block.hash, on: 'end' }); return row; }
          row.why = Deals.fpos(total) ? 'past' : 'not_owner'; return row;
        }
        if (!measure.unlimited && Deals.fcmp(want, avail) > 0) {
          if (Deals.fcmp(want, Deals.fadd(avail, freedIfSeen())) <= 0) { row.why = null; row.wait.push({ block: d.block.hash, on: 'end' }); return row; }
          row.why = 'past'; return row;
        }
        row.takes = true; row.amount = want;
        const st = Identity.standsOf(d.block, pool);
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
            let landedF = row.amount, freedF = Deals.F0;
            const said = (start ? [start] : ys).map(a => a.state.amount).find(a => Deals.isAmount(a) && (measure.byUnit ? a.unit === (d.amount || measure.kind).unit : Deals.sameKind(a, d.amount || measure.kind)) && Deals.fcmp(Deals.dec(a.value), row.amount) <= 0);
            if (said && measure.said) { landedF = Deals.dec(said.value); freedF = Deals.fsub(row.amount, landedF); }
            if (condLands(d)) {
              row.landed = true; row.start = start; row.landedF = landedF; row.freedF = freedF; row.yes = ys;
              if (Deals.fpos(freedF)) row.partFreedBy = (start || ys[0]).hash;
            }
          }
        }
        if (row.landed && row.landedF === undefined) row.landedF = row.amount;
        return row;
      };
      // what a draw that takes does to the running amount: held in full, or soft where a no, an end or a part-accept may free it
      const commit = row => {
        const d = row.d;
        if (d.performs) { const orow = rows.get(d.performs.block.hash); if (orow && orow.takes && !orow.superseded) { orow.superseded = row; const i = soft.indexOf(orow); if (i >= 0) soft.splice(i, 1); else hard = Deals.fsub(hard, orow.amount); } }
        if (row.landed ? (row.freedF && Deals.fpos(row.freedF)) : (freersOf(d).size > 0 || endsOf(d).length > 0 || deadIn(d, null))) soft.push(row); else hard = Deals.fadd(hard, row.amount);
      };
      const setRow = row => rows.set(row.d.block.hash, row);
      // ---- the draws of a pair on this measure, decided together
      // Not built: a clock that orders a pair where his voice states a reach; a pair is read as folds.md, A fork is a burden says
      const groupOfDraw = d => { const r = parent.has(d.block.hash) ? find(d.block.hash) : null; return r === null ? null : list.filter(x => parent.has(x.block.hash) && find(x.block.hash) === r && lineI.of(x.block).s !== 'off'); };
      const decideGroup = G => {
        // twins `for` one deal count once: the same deal in `refs.for`, the same receiver and the same amount
        const sig = d => (Check.asList(d.block.refs.for).length ? Bytes.jcs([Check.asList(d.block.refs.for), d.to, d.amount, d.kind]) : null);
        const reps = [], twinOf = new Map();
        for (const d of G.slice().sort((x, y) => Basics.cmp(x.block.hash, y.block.hash))) { const sg = sig(d), r = sg === null ? null : reps.find(x => sig(x) === sg); if (r) twinOf.set(d.block.hash, r); else reps.push(d); }
        // a pair is decided from what each draw would do alone (readOne): all that fit take; else those with her yes (landed) take where they fit, a draw without her yes changes nothing; two with her yes that do not fit: neither, `pair`. Twin rows are listed as the draw they repeat, with an amount of nothing
        const cand = new Map(reps.map(d => [d.block.hash, readOne(d)]));
        // the receivers' own `declined` or `stopped` answers (whether or not her yes came before) give a draw up; one draw left is read as a draw alone
        const givenUp = d => answersTo(d).some(a => isNo(a) && speakerOf(a, pool) === d.to);
        const live = reps.filter(d => !givenUp(d));
        const C = reps.filter(d => cand.get(d.block.hash).takes && !givenUp(d));
        // her yes, landed or not (rule 4: a draw of the pair without its receiver's yes changes nothing on the others); a make names no receiver and needs no one's yes
        const hasYes = d => d.to == null || yesCandidates(d).length > 0;
        const S = C.filter(hasYes);
        const sum = list2 => Deals.fsumF(list2.map(d => cand.get(d.block.hash).amount));
        let first = null; for (const d of C) { const a = cand.get(d.block.hash).avail; if (a && (first === null || Deals.fcmp(a, first) < 0)) first = a; }
        const fitsAll = C.length > 0 && first !== null && Deals.fcmp(sum(C), first) <= 0;
        let takers = [];
        if (live.length === 1) takers = C.filter(d => d === live[0]);
        else if (fitsAll) takers = C;
        else if (S.length >= 2 && first !== null && Deals.fcmp(sum(S), first) <= 0) takers = S;
        else if (S.length === 1) takers = S;
        const unresolved = live.length >= 2 && C.length >= 2 && !fitsAll && S.length >= 2 && takers.length < S.length;
        for (const d of G) {
          const rep = twinOf.get(d.block.hash) || d, row0 = cand.get(rep.block.hash);
          if (!row0) continue;
          let row;
          if (takers.includes(rep)) row = twinOf.has(d.block.hash) ? { ...row0, d, amount: Deals.F0, landedF: Deals.F0, freedF: undefined, twin: true } : row0;
          else { const why = row0.why !== null && !row0.takes ? row0.why : (givenUp(rep) ? null : 'pair'); row = { d, takes: false, why, amount: null, landed: false, wait: why === 'pair' ? [] : row0.wait || [] }; if (row0.takes && givenUp(rep)) { row.takes = true; row.amount = row0.amount; row.landed = false; row.givenUp = true; } } // a draw that takes nothing (`pair`) waits on nothing
          setRow(row); done.add(d.block.hash);
          if (row.takes && !row.twin && !row.givenUp) commit(row); // a draw of a pair its receiver gave up holds nothing against the others: it is freed
        }
        if (unresolved) { conflict = true; lingering = Deals.fadd(lingering, sum(S)); pairInfo.push({ line: lk, members: G.map(d => ({ draw: d.block.hash, to: d.to === undefined ? null : d.to, yes: hasYes(twinOf.get(d.block.hash) || d) })) }); }
      };
      for (const d of list) {
        if (done.has(d.block.hash)) continue;
        const G = groupOfDraw(d);
        if (G && G.length >= 2) { decideGroup(G); continue; }
        // a later block of a key whose pair did not fit reads `pair`: it is a block of a fork and draws on a measure the pair names
        if (conflict && forkset.has(d.block.hash)) { setRow({ d, takes: false, why: 'pair', amount: null, landed: false, wait: [] }); continue; }
        const row = readOne(d); setRow(row);
        if (row.takes) commit(row);
      }
      if (conflict) forkedLines.add(lk);
    }
    // ---- her wills. While she can sign, a will holds nothing (it takes, is held, and no amount is out of what she owns); an accept of it before the close is a request. At the close her wills take in the order of her line, on
    // what her other draws left; a will whose thing is gone takes nothing. it lands where a yes of its receiver exists (an accept before the close is that yes); her stop of it counts as any stop does (the rule that her stop counts once a clock received it before the cutoffs that closed the close's wait is not built) (the text does not say; read so)
    {
      const wills = drawList.filter(d => d.will).sort((x, y) => lineI.of(x.block).depth - lineI.of(y.block).depth || Basics.cmp(x.block.hash, y.block.hash));
      const leftOf = new Map();
      const leftOn = (owner, key) => {
        const lk = owner + '\u0000' + key;
        if (!leftOf.has(lk)) {
          const h = holdings.get(lk);
          let v = h ? Deals.fsumF(h.incs.filter(i => i.cond === undefined || condHeldIn(i.cond, null)).map(i => i.f)) : Deals.F0;
          for (const r of rows.values()) if (r.takes && r.d.by === owner && r.d.key === key && !r.d.will) { let out = r.amount; if (r.landed) { if (r.freedF && Deals.fpos(r.freedF)) out = Deals.fsub(out, r.freedF); } else if (r.givenUp || freersOf(r.d).size || deadIn(r.d, null)) out = Deals.F0; v = Deals.fsub(v, out); }
          leftOf.set(lk, v);
        }
        return leftOf.get(lk);
      };
      for (const d of wills) {
        // while she can sign a will is no draw at all (it holds nothing; it is a word shown with the thing, `named_by`). At her first close (the one no
        // other of her closes has in its past) it is read, unless her stop of it is in that close's causal past (she may end it until the close)
        const cl = (Identity.identityFold(d.by, pool).closes || []).filter(c => seen(c));
        const first = cl.find(c => !cl.some(o => o !== c && ptl(c).has(o)));
        // her stop counts once it is in the close's causal past, or one of her clocks received it before the cutoffs that closed the close's wait
        const idfW = Identity.identityFold(d.by, pool);
        // (her stops of the will among every block given, as the core reads them: a stop names the will, not the thing)
        const willStops = pool.all().filter(w => w.state && w.state.status === 'stopped' && w.refs && w.refs.updates === d.block.hash && w.type === d.block.type && Identity.counts(w, pool) && speakerOf(w, pool) === d.by);
        if (first === undefined || willStops.some(w => ptl(first).has(w.hash) || (idfW.receivedBeforeCloseWait && idfW.receivedBeforeCloseWait(w.hash, first)))) continue;
        const row = { d, takes: false, why: null, amount: null, landed: false, wait: [], will: true };
        rows.set(d.block.hash, row);
        const key = d.key, left = leftOn(d.by, key);
        const closed = true;
        const want = d.amount && !measure.unlimited ? Deals.dec(d.amount.value) : left;
        if (d.amount && !measure.unlimited && !(measure.said && (measure.byUnit ? d.amount.unit === measure.kind.unit && !('of' in d.amount) : Deals.sameKind(d.amount, measure.kind)))) { row.why = measure.said ? 'unit' : 'no_measure'; continue; }
        if (!closed) { row.takes = true; row.amount = want; continue; } // in life: held, and holds nothing
        if (!holdings.get(d.by + '\u0000' + key) || !Deals.fpos(want) || Deals.fcmp(want, left) > 0) { row.why = holdings.get(d.by + '\u0000' + key) && Deals.fpos(left) !== false && Deals.fpos(want) ? 'past' : 'not_owner'; if (Deals.fpos(left) === false && holdings.get(d.by + '\u0000' + key)) row.why = 'past'; continue; }
        row.takes = true; row.amount = want;
        leftOf.set(d.by + '\u0000' + key, Deals.fsub(left, want));
        const ys = yesCandidates(d);
        if (ys.length) { const start = oneStart(ys, d); row.landed = true; row.landedF = want; row.start = start; row.yes = ys; }
      }
    }
    return rows;
  }
  // what an earlier draw still takes out of the line for a later one: all of it, unless a no or an end she saw (in the later draw's past) freed it; a part an accept left is freed by that accept
  const drawnBy = (t, cur) => {
    if (t.landed) return t.freedF && Deals.fpos(t.freedF) && ptl(cur.block.hash).has(t.partFreedBy) ? Deals.fsub(t.amount, t.freedF) : t.amount;
    return freedFor(t.d, cur) ? Deals.F0 : t.amount;
  };
  // the end of a draw that stands in a causal past: her stop is in it
  const endIn = (d, past) => endsOf(d).some(w => past.has(w.hash));
  const condHeldIn = (t, past) => { try { return conditionHolds1(t, pool, h => seen(h) && (!past || past.has(h)), now); } catch (e) { return false; } };
  // a condition is read in the causal past of the block that relies on it. A draw whose condition does not hold on everything given has landed, for what was built on it, where a later draw of its receiver has it in its causal past and reads the
  // condition held there ("J1 used"): what landed and stood stays where it is. "relies on it" is read as a draw of the receiver's, on any measure, that has the conditioned draw in its causal past (the text does not say; read so)
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
  const circleLineOf = owner => { if (!Basics.isStr(owner)) return null; const C = pool.get(owner); if (!Circles.isFoundingCircle(C)) return null; pool._clm = pool._clm || new Map(); if (!pool._clm.has(owner)) { const cn = Circles.circleNow(owner, pool, null); pool._clm.set(owner, cn && cn.meter !== null ? cn.meter : null); } return pool._clm.get(owner); };
  // the place of a block on a circle's meter line: the order of the meter's receipts that name it; null when none does
  const meterPlace = (meter, h) => { pool._mpl = pool._mpl || new Map(); if (!pool._mpl.has(meter)) { const M = pool.get(meter); const who = M ? (M.refs.author === undefined ? M.hash : M.refs.author) : meter; pool._mpl.set(meter, pool.all().filter(r => r.type === 'observe' && r.state.kind === 'receipt' && r.refs.author === who && Identity.counts(r, pool)).sort((x, y) => lineI.of(x).depth - lineI.of(y).depth || Basics.cmp(x.hash, y.hash))); } const recs = pool._mpl.get(meter); const i = recs.findIndex(r => Check.asList(r.refs.derives_from).includes(h)); return i < 0 ? null : i; };
  function build(rows) {
    const holdings = new Map();
    const put = (owner, key, start, inc, noLine) => {
      if (circleLineOf(owner)) key = 'circle'; // every draw that speaks for a circle that names a meter is counted on the one line of that meter
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
      if (d.passTool) { if (row.landed && row.landedF && Deals.fpos(row.landedF)) put(d.passTool.owner, d.passTool.key, null, { f: row.landedF, at: (row.yes && row.yes[0] ? row.yes[0].hash : d.block.hash) }); continue; } // the part starts on the receiving tool's line at its accept
      if (!d.stays || !row.landed || !row.landedF || !Deals.fpos(row.landedF) || typeof d.to !== 'string' || d.to === 'open') continue;
      if (row.start) put(d.to, keyOfB(row.start), row.start, { f: row.landedF, at: row.start.hash, cond: d.cond, seen: d.block.hash });
      else put(d.to, '~', null, { f: row.landedF, at: null, seen: d.block.hash }, true);
    }
    // a first use that takes what a let-go left: no draw, its own rule (folds.md, Ownership)
    if (rows && measure.takeUp) for (const row of rows.values()) {
      const d = row.d;
      if (d.kind !== 'letgo' || !row.takes || !row.landed) continue;
      const t = measure.takeUp(d);
      if (t) { row.takenUp = t; put(t.owner, keyOfB(t.start), t.start, { f: row.amount, at: t.start.hash }); }
    }
    return holdings;
  }
  const sig = hs => [...hs.values()].map(h => h.owner + '|' + h.key + '|' + h.incs.map(i => i.at + ':' + Deals.fText(Deals.fnorm(i.f))).join(',')).sort().join(';');
  let holdings = build(null), rows = evaluate(holdings);
  for (let round = 0; round < 40; round++) {
    const next = build(rows);
    if (sig(next) === sig(holdings)) break;
    holdings = next; rows = evaluate(holdings);
  }
  // a line that is not read whole answers nothing (folds.md, A chain): not_shown, the blocks it would need
  const holes = [...rows.values()].some(r => r.why === 'not_shown');
  // the lacks in one order (as the core gives them): ids first, then the `{ author, key, seq }` entries, each by its canonical text
  if (holes) return { not_shown: true, lacks: lacksAll.slice().sort((x, y) => (typeof x === 'string') !== (typeof y === 'string') ? (typeof x === 'string' ? -1 : 1) : Basics.cmp(typeof x === 'string' ? x : Bytes.jcs(x), typeof y === 'string' ? y : Bytes.jcs(y))) };
  // ---- the draws listed, and the amounts left
  const entries = [], waitingOut = [];
  let held = Deals.F0, ended = Deals.F0, letGo = Deals.F0;
  const owners = new Map();
  const lineLeft = new Map(); // holding id -> what its owner has left
  for (const [id, h] of holdings) lineLeft.set(id, Deals.fsumF(h.incs.filter(i => i.cond === undefined || condHeldIn(i.cond, null)).map(i => i.f)));
  for (const row of rows.values()) {
    const d = row.d, b = d.block;
    let state = null;
    if (row.takes) {
      if (row.landed) state = 'landed';
      else state = row.givenUp || [...freersOf(d)].length || deadIn(d, null) ? 'freed' : 'held';
      if (row.superseded) state = row.superseded.landed ? 'landed' : state; // an offer performed by a transfer that lands is landed with it
    }
    // a draw that is freed or landed waits on nothing
    if (!row.takes || state === 'held') for (const w of row.wait) say(waitingOut, w);
    // a draw held because its condition has not held is waiting on it (`on: condition`); no reader's clock shows it
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
    if (state === 'freed' || row.superseded || (row.will && !row.landed)) out = Deals.F0; // a will holds nothing while she can sign
    else if (row.landed && row.freedF && Deals.fpos(row.freedF)) out = Deals.fsub(out, row.freedF);
    if (h) lineLeft.set(id, Deals.fsub(lineLeft.get(id), out));
    if (state === 'held' && !d.pass && !row.superseded && !row.will) held = Deals.fadd(held, row.amount);
    if (d.pass) held = held; // a grant's part is held on the grant's line, never counted as held here
    if (!d.stays && row.landed && d.lands !== 'never') {
      if (d.to === 'open' || d.kind === 'letgo') { if (!row.takenUp) letGo = Deals.fadd(letGo, row.amount); }
      else if (d.kind === 'make') ended = Deals.fadd(ended, row.amount);
    }
  }
  for (const [id, h] of holdings) { const left = forkedLines.has(id) ? Deals.F0 : lineLeft.get(id); if (!Deals.fpos(left)) continue; owners.set(h.owner, Deals.fadd(owners.get(h.owner) || Deals.F0, left)); }
  entries.sort((x, y) => Basics.cmp(x.block, y.block));
  // the waiting list in one order, as the core gives it: by block, then by what it waits on
  waitingOut.sort((x, y) => Basics.cmp(x.block, y.block) || Basics.cmp(x.on, y.on));
  return { not_shown: false, rows, holdings, entries, waiting: waitingOut, owners, held, ended, letGo, pairs: pairInfo.map(p => ({ line: p.line, members: p.members })) };
}
// the first use that takes what a let-go left, and the owner it makes: nothing is a draw here (folds.md, Ownership)

// ================================================================ ownership and place (folds.md)
// principalOf(block): the circle the block was signed `as` (when its signer may sign for it), else its author; for a grant, its grantor
function principalOf(b, pool) { return b.refs.as !== undefined ? (Circles.mayActAsIn(b, b.refs.as, pool) ? b.refs.as : null) : b.refs.author; } // a row holds for it, or every owner signs it (circles.md)
// who a block speaks for (folds.md, Who a block speaks for): one party. A block that names a circle in `as` speaks for it when its author may
// sign for it, else for no one; a block under a live grant made for its receiver speaks for the grantor (a promise outside the grant's scope is
// a quote request and still does; any other block outside it speaks for its author); any other block speaks for its author.
function speakerOf(b, pool) {
  const key = 'spk:' + b.hash, mine = pool.get(b.hash) === b;
  if (mine && pool.memo.has(key)) return pool.memo.get(key);
  const t0 = pool._taint || 0;
  const out = speakerNow(b, pool);
  if (mine && (pool._taint || 0) === t0) pool.memo.set(key, out); // an answer that read a circle's row while that row was being read (a ring) is not kept (circles.md)
  return out;
}
// under a grant: the block passes the door's whole authority test (whyNotUnder). A promise a tool signs under a grant that
// keeps to no promise the grant names speaks for its signer alone
function speakerNow(b, pool) {
  const g = b.refs.under !== undefined ? pool.get(b.refs.under) : null;
  if (g && g.type === 'grant' && (b.refs.as === undefined || b.refs.as === principalOfChain(g, pool)) && Grants.grantLive(g, pool, new Set(), b) && Grants.receives(g, b, pool) && !Grants.whyNotUnder(b, pool).length) return principalOfChain(g, pool);
  return principalOf(b, pool);
}
// the grant at the top of a chain: the grant, then each grant above it that it was passed on from (refs.parent), to the first not passed on. The one walk:
// backed, gives and speakerOf all read the top of a chain through it. Whether each link is live is whyNotUnder's question.
// A decline is a reading: an observe that answers a block and says declined (core.md, Types). One written before the three moods has the type of the
// block it answers and is read as before (append-only).
const isDeclineReading = b => b.type === 'observe' && b.state.status === 'declined' && b.refs.answers !== undefined;
// a machine's accept (promises.md, Answers): an observe that answers a promise, says accepted and acts under a grant (refs.under); its reading "accepted under her rule" is her accept only when the grant is live, made for the machine and covers it
const isMachineAccept = (b, pool) => b.type === 'observe' && b.state.status === 'accepted' && b.refs.under !== undefined && Basics.isStr(b.refs.answers) && !!pool.get(b.refs.answers) && pool.get(b.refs.answers).type === 'promise';
function grantTop(g, pool) { for (;;) { const up = g.refs.parent === undefined ? null : pool.get(g.refs.parent); if (!up) return g; g = up; } }
function principalOfChain(g, pool) { return principalOf(grantTop(g, pool), pool); }
// whether a receiver's accepted answer to a transfer still counts (things.md, Transfers): a transfer to a named receiver is read like an offer. The
// giver's withdrawal (their own updates of it, stopped with before) voids an accept that has it in its causal past; on a transfer that carried
// expires, the giver's declined answer to the accept voids it
// with no clock, an answer is in time only by its own `at`, before the end it answers; one in time lands, and the giver's decline of it takes back
// nothing
const inTimeByAt = (a, t) => Basics.isStr(t.state.expires) && Basics.isStr(a.state.at) && a.state.at < t.state.expires;
function answerStands(t, a, pool) {
  const giver = speakerOf(t, pool);
  if (giver === null) return true;
  // the cheap conditions first: whose word a block is (a fold of its own) is asked only of a block that could withdraw this one
  return !pool.all().some(w => (w.type === 'transfer' || isDeclineReading(w)) &&
    ((w.type === 'transfer' && w.state.status === 'stopped' && w.state.stop === 'before' && w.refs.updates === t.hash && pool.sees(a.hash, w.hash)) ||
     (t.state.expires !== undefined && w.state.status === 'declined' && w.refs.answers === a.hash && !inTimeByAt(a, t))) && Identity.counts(w, pool) && speakerOf(w, pool) === giver);
}
// whether a block given whole is read among the blocks given (core.md, read): a fold asked about one that is not read gives no answer
const isReadIn = (b, blocks) => { try { return !!b && typeof b === 'object' && b.type !== undefined && Check.readFindings(b, Check.poolOf(blocks).all()).length === 0; } catch (e) { return false; } };
// the blocks given, and the thing itself when it is not among them (a thing given whole is read with the blocks)
const withThing = (thingIn, blocks) => { const pool = Check.poolOf(blocks); return typeof thingIn === 'string' || pool.get(thingIn.hash) ? pool : new Check.Pool([thingIn, ...pool.all()]); };

// the one start of an amount that came onto a line by accepts (folds.md, One start): the earliest accept; where two keys accepted apart (neither in the other's causal past) neither
// starts a line, unless a later block of hers whose `after` names both is the one start. null: no line.
function oneStartIn(pool, cands, passed) {
  const minimal = list => list.filter(x => !list.some(y => y !== x && pool.sees(x.hash, y.hash)));
  // One start: an amount that comes to her starts on the line of the voice her list marks `receives: true`, else her first voice. Another key's accept of it is her yes and starts nothing.
  // where her list names no voice (a thing that is no person, a list not read), the amount starts on the earliest accept
  const first = cands[0], owner = first && Basics.isStr(first.refs && first.refs.author) ? first.refs.author : null;
  const idf = owner ? Identity.identityFold(owner, pool) : null;
  // a transfer to its own giver (a part she hands from one key's line to another's) brings no amount to her: the accept of the key it is handed to starts that line, as before
  if (!passed && idf && idf.voices && idf.voices.length) {
    const v = idf.voices.find(x => Basics.isObj(x) && x.receives === true) || idf.voices[0];
    const mine = cands.filter(c => { const k = Identity.signerKeyOf(c, pool); return Basics.isStr(k) && (v.key === k || (Basics.isStr(v.key_hash) && Check.hashNamesKey(v.key_hash, k))); });
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
const isMakeBlock = b => b.type === 'transform' && Check.asList(b.refs.derives_from).length > 0;
const isKeepBlock = b => b.type === 'transform' && Check.asList(b.refs.derives_from).length === 0 && Basics.isStr(b.refs.subject);
// the ownership of a kind or of an actor is the empty answer (no owner, no draws), not null; the door answers null for a block it does not hold as read
const EMPTY_OWN = () => ({ kind: null, stated: null, owners: [], owner: null, held: null, ended: null, let_go: null, draws: [], waiting: [], pair: [], named_by: [], read: [] });
// whether a block is an instance by its own word: it names its kind, what it is part of or where it is, or a make it came from (things.md, Things). A kind has no owner.
const isInstance = t => !!t && t.type !== 'actor' && ['of', 'derives_from', 'subject', 'place'].some(k => Check.asList(t.refs[k]).length > 0);

// within: the hashes it reads (a block's causal past), each block read as it is among all given; left out, all
function ownershipFold(thingIn, blocks, within, now = '') {
  const pool = withThing(thingIn, blocks);
  const thing = pool.get(typeof thingIn === 'string' ? thingIn : thingIn.hash);
  const seen = h => !within || within.has(h);
  if (!thing || !seen(thing.hash)) return EMPTY_OWN(); // an instance that rests on blocks not given is not read yet
  const memoKey = 'own|' + thing.hash + '|' + (within ? setId(within) : '') + '|' + now;
  if (pool.folds.has(memoKey)) { const v = pool.folds.get(memoKey); if (pool._busyF && pool._busyF.has(v)) if (pool._inCircle) pool._taint = (pool._taint || 0) + 1; return v; } // an answer that read the placeholder below is not kept by whoever asked
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
  const makes = Check.asList(thing.refs.derives_from).map(h => pool.get(h)).filter(m => m && m.type === 'transform' && seen(m.hash) && Identity.counts(m, pool) && m.refs.author === thing.refs.author && (isMakeBlock(m) || (Check.asList(m.refs.derives_from).length === 0 && !Basics.isStr(m.refs.subject))));
  if (makes.length) return makes.flatMap(m => Check.asList(m.refs.derives_from).filter(h => h !== thing.hash).map(h => [h, within]));
  const keeps = Check.asList(thing.refs.derives_from).map(h => pool.get(h)).filter(k => k && isKeepBlock(k) && seen(k.hash) && Identity.counts(k, pool));
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
// each is marked as being read exactly while the recursion would mark it, and remembered under the same key. The thing
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
      // a reader's own limit on a walk (`setReadLimit`). Where it stops it names the first block it did not read: here the make that made the thing it would read next
      if (frames.length >= READ_LIMIT) { const mk = Check.asList(t.refs.derives_from).map(x => pool.get(x)).find(x => x && x.type === 'transform'); throw new WalkStopped(mk ? mk.hash : t.hash); }
      pool.folds.set(key, EMPTY_OWN());
      frames.push({ t, w, key, deps: ownershipReadsFirst(t, pool, w), i: 0 });
      continue;
    }
    frames.pop();
    if (top.t) pool.folds.set(top.key, ownershipNow(top.t, pool, x => !top.w || top.w.has(x), top.w, now));
  }
}
function ownershipNow(thing, pool, seen, within, now) {
  const isParts = Circles.isFoundingCircle(thing) && !!Circles.packOf(thing); // a circle's parts are an amount of a measure like any other, the founder's first
  if (thing.type === 'actor' && !isParts) return EMPTY_OWN(); // nothing reaches a person: no word makes an actor property (core.md, section 11)
  if (!isInstance(thing) && !isParts) return EMPTY_OWN();       // a kind: no owner, and a draw on it moves nothing (things.md, Things)
  const pack = Deals.isAmount(thing.state.pack) ? thing.state.pack : null;
  // the `kind` an ownership answer gives is { unit, of }: the unit of the pack and, for an instance, its `refs.of` ("their kind is the measure's own (for an instance, its refs.of)"), null when it has none
  const ofId = Check.asList(thing.refs.of).length ? Check.asList(thing.refs.of)[0] : null;
  const keyOf = b => { const k = Identity.signerKeyOf(b, pool); return k === null || k === undefined ? '' : k; };
  const speaker = b => speakerOf(b, pool);
  // ---- who owns it first (folds.md, Who owns it first; things.md, A make)
  let said = !!pack, firsts = [];
  const acceptedBy = (owner, what) => pool.all().filter(a => seen(a.hash) && a.state.status === 'accepted' && Check.asList(a.refs.answers).includes(what.hash) && Identity.counts(a, pool) && speaker(a) === owner);
  const makes = Check.asList(thing.refs.derives_from).map(h => pool.get(h)).filter(m => m && m.type === 'transform' && seen(m.hash) && Identity.counts(m, pool) && m.refs.author === thing.refs.author && (isMakeBlock(m) || (Check.asList(m.refs.derives_from).length === 0 && !Basics.isStr(m.refs.subject))));
  const keeps = Check.asList(thing.refs.derives_from).map(h => pool.get(h)).filter(k => k && isKeepBlock(k) && seen(k.hash) && Identity.counts(k, pool));
  if (makes.length) {
    // the output of a make belongs to the owner of what was taken; a first possession (no inputs) to its author
    const takes = [];
    for (const m of makes) {
      const inputs = Check.asList(m.refs.derives_from).filter(h => h !== thing.hash);
      if (!inputs.length) { takes.push({ owner: speaker(m), f: null, unit: null, make: m, speaks: true }); continue; }
      for (const i of inputs) {
        const r = ownershipFold(i, pool, within, now);
        if (r.not_shown) return r;
        const rec = r.draws.find(x => x.block === m.hash && x.takes);
        if (rec) takes.push({ owner: rec.by, f: rec.took, unit: rec.amount ? rec.amount.unit : (r.stated ? r.stated.unit : null), make: m, speaks: rec.speaks });
      }
    }
    const owners = [...new Set(takes.map(t => t.owner).filter(Basics.isStr))];
    const lone = owners.length === 1;
    if (!lone) {
      // from several: each owns the amount taken from her, when the pack is the sum of what was taken in one kind; otherwise each is named with no amount
      const sameUnit = pack && takes.length && takes.every(t => t.f && t.unit === pack.unit);
      const total = sameUnit ? Deals.fsumF(takes.map(t => t.f)) : null;
      said = !!(sameUnit && Deals.fcmp(total, Deals.dec(pack.value)) === 0);
    }
    for (const o of owners) {
      const mine = takes.filter(t => t.owner === o);
      const f = lone ? (pack ? Deals.dec(pack.value) : WHOLE) : said ? Deals.fsumF(mine.map(t => t.f)) : WHOLE;
      // her start: a make that speaks for her (hers from that block), else her own accepted answer to the output (a make by someone else, a stranger's claim)
      // cases 2 and 3 of her start (folds.md, What is left) are one rule here: her own `accepted` answer to the output; a stranger's make takes nothing of hers (`not_owner`), so it has no owner to start
      // where several makes of hers speak for her, her start is the one that sees the others; apart, she owns the output on no line
      const speaking = [...new Set(mine.filter(t => t.speaks).map(t => t.make))]; // one make that took from several of her lots is one make
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
        firsts.push({ owner: o, start: line ? start : null, f: lone ? (pack ? Deals.dec(pack.value) : WHOLE) : WHOLE, noLine: !line });
      }
    }
  } else {
    const sp = speaker(thing);
    if (Basics.isStr(sp)) firsts.push({ owner: sp, start: thing, f: pack ? Deals.dec(pack.value) : WHOLE });
  }
  const measure = { kind: pack ? { unit: pack.unit, of: ofId } : null, said, byUnit: true, firsts: [], adds: [] };
  for (const f of firsts) measure.firsts.push(f.noLine ? { owner: f.owner, start: null, f: f.f, key: '~' } : f);
  // ---- what draws on it (folds.md, A draw): a transfer to a named receiver or to an open one, a make that names it, a grant that passes a part of it
  const draws = [];
  const grantsOver = new Map(); // grant hash -> { owner, holder, key }
  for (const b of pool.all()) {
    if (!seen(b.hash) || Identity.voided(b, pool) || b.hash === thing.hash) continue;
    if (b.type === 'transfer' && b.state.status === undefined && b.refs.answers === undefined && Check.asList(b.refs.what).includes(thing.hash)) {
      // a block that speaks for no one (a circle's move no row holds for, an unauthorised block) is no draw: it is not listed
      const sp = speaker(b); if (!Basics.isStr(sp)) continue;
      const named = Check.asList(b.refs.to_owner)[0], open = named === undefined && b.state.count !== undefined;
      if (named === undefined && !open) continue; // kept apart or placed only: it moves the holder or the place, not the title
      let amt = Deals.isAmount(b.state.amount) ? b.state.amount : null;
      if (isParts && amt && !/^[0-9]+$/.test(amt.value)) amt = { value: amt.value, unit: 'part\u0000fraction' }; // a fraction of a part is another kind, so a draw of one takes nothing (`unit`)
      if (amt && !Deals.fpos(Deals.dec(amt.value))) continue; // a transfer of zero is no draw
      // a block of a tool of hers, under a grant whose types name `transfer`, that gives a part its line holds to another tool of hers passes that part; it starts on that tool's line at its accept. It gives nothing away.
      const pg = b.refs.under !== undefined ? pool.get(b.refs.under) : null;
      if (pg && pg.type === 'grant' && named !== undefined && b.refs.author !== sp && Check.asList(pg.refs.what).includes(thing.hash) && Grants.isPassOn(b, pg, pool) && !Grants.whyNotUnder(b, pool).length) {
        draws.push({ block: b, by: sp, to: named, amount: amt, lands: 'accept', stays: false, kind: 'pass', key: 'grant:' + pg.hash, passTool: { owner: sp, key: 'pass:' + named } });
        continue;
      }
      draws.push({ block: b, by: sp, to: named === undefined ? 'open' : named, amount: amt, shown: amt && amt.unit === 'part\u0000fraction' ? { ...b.state.amount } : undefined, lands: named === undefined ? 'stands' : 'accept', stays: named !== undefined, kind: named === undefined ? 'letgo' : 'transfer', cond: b.state.condition !== undefined ? b : undefined,
        will: named !== undefined && Basics.isObj(b.state.condition) && b.state.condition.closed === sp }); // a will is her own transfer on `{ closed: <her id> }`
    } else if (b.type === 'transform' && Check.asList(b.refs.derives_from).includes(thing.hash)) {
      const sp = speaker(b); if (!Basics.isStr(sp)) continue;
      const inp = (Array.isArray(b.state.inputs) ? b.state.inputs : []).find(x => Basics.isObj(x) && x.from === thing.hash);
      const amt = inp && Deals.isAmount(inp.amount) ? inp.amount : null;
      if (amt && !Deals.fpos(Deals.dec(amt.value))) continue;
      draws.push({ block: b, by: sp, to: null, amount: amt, lands: 'at once', stays: false, kind: 'make' });
    } else if (b.type === 'promise' && b.state.status === undefined && b.refs.answers === undefined && b.refs.updates === undefined && Check.whatsOf(b).includes(thing.hash) && Basics.isStr(b.refs.from) && Basics.isStr(b.refs.to) && b.refs.to !== b.refs.from) {
      // a block that names an instance of its signer's and a receiver is a draw on that instance, whether it is a transfer, an offer, or a yes to an order. It holds the amount it states from where its signer signs it, on his line.
      // An offer lands, or is freed, where the accept that answers it binds or does not; its landing waits on Due (the block that performs it, a transfer `for` it).
      // only the giver's own first promise to a named receiver is the draw (an order from the buyer's side, the seller's yes to it, a counter and an open offer are not); it holds the
      // quantity of the line that names the instance where that is an amount of the instance's unit, else all she owns of it
      const sp = speaker(b); if (!Basics.isStr(sp) || sp !== b.refs.from) continue;
      const holdLine = Check.linesOf(b.state.terms).find(l => l.what === thing.hash);
      const q = pack && holdLine && Deals.isAmount(holdLine.quantity) ? holdLine.quantity : null; // a whole thing (no pack) is held whole
      if (q && !Deals.fpos(Deals.dec(q.value))) continue;
      draws.push({ block: b, by: sp, to: b.refs.to, amount: q, lands: 'never', stays: false, kind: 'offer' });
    } else if (b.type === 'grant' && b.state.status === undefined && b.refs.answers === undefined && Check.asList(b.refs.what).includes(thing.hash) && Basics.isStr(b.refs.to)) {
      // a grant that names an instance passes the part (scope.limit, else all she owns) to its holder's line (folds.md, A draw)
      const sp = speaker(b); if (!Basics.isStr(sp)) continue;
      const lim = Basics.isObj(b.state.scope) && Deals.isAmount(b.state.scope.limit) ? b.state.scope.limit : null;
      const key = 'grant:' + b.hash;
      grantsOver.set(b.hash, { owner: sp, holder: b.refs.to, key });
      draws.push({ block: b, by: sp, to: b.refs.to, amount: lim && measure.said && lim.unit === measure.kind.unit ? lim : null, lands: 'never', stays: false, kind: 'grant', pass: { owner: sp, key } });
    }
  }
  // a transfer `for` an offer of the same signer to the same receiver performs that offer's hold: the hold is not counted twice (it is taken up by the transfer where the transfer takes)
  for (const d of draws) if (d.kind === 'transfer') { const o = draws.find(x => x.kind === 'offer' && x.by === d.by && x.to === d.to && Check.asList(d.block.refs.for).includes(x.block.hash)); if (o) { d.performs = o; o.performedBy = d; } }
  // a make under a grant that passes a part is a draw on the grant's line, by whom the grant speaks for (toll work, or her own tool)
  for (const d of draws) {
    if (d.kind !== 'make' || d.block.refs.under === undefined) continue;
    const g = grantsOver.get(d.block.refs.under), gb = pool.get(d.block.refs.under);
    // a make under a grant speaks for the owner (a tool of hers: hers from that make) only where the grant names a promise in `scope.on`, which is what a block that binds her keeps to (the text does not say; read so)
    // (authority.md, Blocks that bind); a grant with none is toll work, and the maker's make binds him alone
    // a grant that names an instance in `refs.what` passes the part (`scope.limit`, else all she owns of it) to a line of its own, `grant:<hash>`; a make by the grant's holder that names the grant in
    // `refs.under` is a draw by the grantor on that line (what a tool holds for her, held on the grant's line as hers). No walk is made of that line (its start is the grant); a hand-back and a grant's end
    // (folds.md, A draw) rest on authority.md's Blocks that bind, and are not built (the text does not say; read so)
    if (g && gb && d.block.refs.author === g.holder && Grants.grantLive(gb, pool, new Set(), d.block)) { d.by = g.owner; d.key = g.key; d.speaks = Basics.isObj(gb.state.scope) && gb.state.scope.on !== undefined; }
  }
  // a first use that takes what a let-go left (no draw): its speaker is the first owner of what was let go (folds.md, Ownership)
  measure.takeUp = d => {
    const takers = pool.all().filter(b => b.type === 'transform' && seen(b.hash) && b.refs.derives_from === undefined && b.refs.subject === thing.hash && Identity.counts(b, pool) && pool.sees(b.hash, d.block.hash));
    const ks = d.block.state.clocks === undefined ? null : Identity.clocksOf(d.block.state.clocks);
    let firstsOf = null;
    // of two blocks one came first on a clock where `needed` of its lines each hold a receipt of it before any receipt of the other. A receipt's place on its line is its time; its `at` orders nothing.
    // Until one holds, neither came first: two first takers that did not come one first: neither takes, and both are listed. a line that holds a receipt of one and none of the other shows the one first.
    if (ks) {
      // first on a line is read from the receipts' places (clockLine): a receipt before another where the other has it in its causal past; a line that holds a receipt of one and none of the other shows the one first
      const cameFirst = (x, y) => ks.names.filter(n => { const rx = Bytes.receiptsOn(n, x.hash, pool), ry = Bytes.receiptsOn(n, y.hash, pool); return rx.length > 0 && (ry.length === 0 || rx.some(a => ry.every(b => a !== b && Bytes.placedBefore(pool, a, b)))); }).length >= ks.needed;
      firstsOf = takers.filter(x => !takers.some(y => y !== x && cameFirst(y, x))).sort(Basics.byHash);
    }
    if (firstsOf === null) firstsOf = Check.earliest(takers, pool);
    return firstsOf.length === 1 && Basics.isStr(speaker(firstsOf[0])) ? { owner: speaker(firstsOf[0]), start: firstsOf[0] } : null;
  };
  const dealYes = d => dealAcceptsFor(d, pool, seen);
  // a block given and not read hides each id in its refs: one that names this thing leaves the answer not shown, whether or not a draw this reader read reaches it. A block given only as its header hides what its
  // key's line given at its place: one on the line of an owner of this measure, after its start, leaves the answer not shown (a pair read from two headers is the same: its branch is in `lacks`).
  {
    const hide = new Set();
    for (const e of pool.all()) if (e.type === undefined && e._body && seen(e.hash) && Check.namedIds(e._body).includes(thing.hash)) hide.add(e.hash);
    // a block this reader cannot judge, given with its body, hides what its refs name (a hole only where it could reach: the lines of keys at or below its place)
    for (const e of pool.unjudged || []) if (seen(e.hash) && Check.namedIds(e).includes(thing.hash)) hide.add(e.hash);
    for (const e of pool.all()) if (e.type === undefined && !e._body && seen(e.hash) && Basics.isStr(e.refs.author)) {
      const k = Identity.signerKeyOf(e, pool);
      for (const f of firsts) if (f.start && f.owner === e.refs.author && k === keyOf(f.start) && (e.state.seq || 0) > (f.start.state.seq || 0)) hide.add(e.hash);
    }
    var hideFirst = hide;
  }
  const readSet = new Set([thing.hash]);
  const r = drawsOn(pool, measure, draws, { seen, now, dealYes, asked: thing.hash, read: readSet });
  // the same for the line of each receiver a draw landed to, from the block that starts her line for it: a block of that line given only as its header, after the start, could name this measure
  {
    const hide = new Set();
    const starts = r.not_shown ? [] : [...r.rows.values()].filter(row => row.landed && row.start && Basics.isStr(row.d.to)).map(row => ({ owner: row.d.to, start: row.start }));
    // and of each receiver who said yes to a draw of a pair left standing (listed in `pair`): her line holds the amount the pair leaves on no
    // one's line, so a block of it after her yes, given only as its header, could name this measure. A draw refused `pair` that leaves no
    // pair standing holds nothing on her line, and "each word of that key it could end" is not read
    if (!r.not_shown) for (const m of r.pairs.flatMap(p => p.members)) if (m.yes && Basics.isStr(m.to)) {
      for (const a of pool.all()) if (a.type !== undefined && a.refs.answers === m.draw && a.state.status === 'accepted' && a.refs.author === m.to && seen(a.hash)) starts.push({ owner: m.to, start: a });
    }
    for (const e of pool.all()) if (e.type === undefined && !e._body && seen(e.hash) && Basics.isStr(e.refs.author)) {
      const k = Identity.signerKeyOf(e, pool);
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
  const sum = f => (pack ? Deals.amtOut(f, unitK) : null);
  const owners = [...r.owners.entries()].filter(([, f]) => Deals.fpos(f)).sort((a, b) => Basics.cmp(a[0], b[0])).map(([owner, f]) => ({ owner, amount: said ? Deals.amtOut(f, unitK) : null }));
  const letGo = r.letGo;
  // the one owner: the only one shown, while nothing is held and nothing let go waits for a first use (what a make ended is gone, not held)
  const noneHeld = !r.entries.some(e => e.takes && e.state === 'held' && !e.will) && !Deals.fpos(letGo); // a will in life holds nothing: the owner is still shown
  const whole = owners.length === 1;
  const entries = r.entries.map(e => { const row = r.rows.get(e.block); if (row && row.takes) Object.defineProperty(e, 'took', { value: row.amount, enumerable: false }); return e; });
  // an instance on a pair answers `pair: [{ draw, to, yes }]` and no owner; every answer names the blocks it read (`read`, sorted ids)
  const pair = r.pairs.flatMap(p => p.members).sort((x, y) => Basics.cmp(x.draw, y.draw));
  // `named_by` [{ block, by, own, pair, ref }], sorted by block: each block the reader holds that names this thing, or a draw this answer lists, by any ref, other than the draws and yeses this answer already lists;
  // whom it speaks for (`by`); whether it is backed by whom the named draw spoke for (`own`); whether it is one of a pair (`pair`); the ref that names it. A word is listed whether or not it counts.
  // for a block that names the thing itself, `own` is read against the thing's own speaker; one entry per block, `ref` the first ref key in byte order that names it (never
  // `author`, `prev`, `key` or `after`); the yeses left out are each receiver's own `accepted` answer to a listed draw (the answer reports them in `state` and `pair`)
  const listed = new Set([thing.hash, ...entries.map(e => e.block)]);
  for (const row of r.rows.values()) for (const y of row.yes || []) listed.add(y.hash);
  const drawBy = new Map(entries.map(e => [e.block, e.by])), drawTo = new Map(entries.map(e => [e.block, e.to]));
  const inPair = new Set(Identity.forkPairs(pool).flat());
  const namedBy = [];
  for (const b of pool.all()) {
    if (b.type === undefined || listed.has(b.hash) || !seen(b.hash)) continue;
    const by = speakerOf(b, pool);
    let hit = null;
    for (const k of Object.keys(b.refs).sort()) {
      if (['author', 'prev', 'key', 'after'].includes(k)) continue;
      const id = Check.asList(b.refs[k]).find(x => x === thing.hash || drawBy.has(x));
      if (id !== undefined) { hit = [k, id]; break; }
    }
    if (!hit) continue;
    const [k, id] = hit;
    if (k === 'answers' && b.state.status === 'accepted' && Basics.isStr(by) && drawTo.get(id) === by) continue;
    const target = id === thing.hash ? speakerOf(thing, pool) : drawBy.get(id);
    namedBy.push({ block: b.hash, by: by === undefined ? null : by, own: Basics.isStr(by) && by === target, pair: inPair.has(b.hash), ref: k });
  }
  namedBy.sort((x, y) => Basics.cmp(x.block, y.block));
  // `read` names the thing, the block that starts each owner's line for it, each draw listed, and each yes that landed one (not the blocks a line was walked through)
  readSet.clear(); readSet.add(thing.hash);
  for (const f of firsts) if (f.start) readSet.add(f.start.hash);
  for (const e of entries) readSet.add(e.block);
  for (const row of r.rows.values()) { if (row.landed && row.start) readSet.add(row.start.hash); if (row.landed) { const ys = row.yes || [], direct = y => Check.asList(y.refs.answers).includes(row.d.block.hash); for (const y of ys) if (!direct(y) || !ys.some(o => o !== y && direct(o) && pool.past(y.hash).has(o.hash))) readSet.add(y.hash); } if (row.takenUp && row.takenUp.start) readSet.add(row.takenUp.start.hash); }
  return { kind: kindOut, stated: pack ? { ...pack } : null, owners, owner: noneHeld && whole && !pair.length ? owners[0].owner : null, held: sum(r.held), ended: sum(r.ended), let_go: sum(letGo), draws: entries, waiting: r.waiting, pair, named_by: namedBy, read: [...readSet].sort() };
}
// her yes by the deal a draw is `for` (folds.md, Lands): her own counted accepted answer to the deal's first promise, or her own first promise that the
// draw's signer accepted, in the draw's own causal past. Read from the blocks themselves, never from the deal's stage (which reads this fold): no loop.
function dealAcceptsFor(d, pool, seen) {
  const out = [], past = pool.past(d.block.hash);
  for (const fh of Check.asList(d.block.refs.for)) {
    const first = pool.get(fh);
    if (!first || first.type !== 'promise' || first.refs.answers !== undefined || !past.has(fh)) continue;
    const answers = pool.all().filter(a => seen(a.hash) && a.type === 'promise' && a.state.status === 'accepted' && Check.asList(a.refs.answers).includes(fh) && past.has(a.hash) && Identity.counts(a, pool));
    for (const a of answers) if (speakerOf(a, pool) === d.to && !out.includes(a)) out.push(a);
    if (first.state.status === undefined && speakerOf(first, pool) === d.to && answers.some(a => speakerOf(a, pool) === d.by)) out.push(first);
    // a buyer's order is her yes to the seller's transfer `for` it that names its instance: the seller's transfer is his yes and his delivery in one block, and lands where it is signed
    else if (first.state.status === undefined && speakerOf(first, pool) === d.to && first.refs.to === d.to && first.refs.from === d.by && d.block.type === 'transfer' && d.block.state.covers !== undefined && Check.whatsOf(first).some(h => Check.asList(d.block.refs.what).includes(h))) out.push(first);
  }
  return out;
}
// the transfers whose condition is being read, so a condition that leads back to the transfer carrying it holds for nothing instead of looping
const reading = new Set();
function conditionHolds1(t, pool, seen, now) {
  if (reading.has(t.hash)) return false;
  reading.add(t.hash);
  try { return Bytes.conditionHolds(t.state.condition, pool.all().filter(b => seen(b.hash)), now) === true; } finally { reading.delete(t.hash); }
}
// a conditioned transfer its receiver let go: her own counted stopped or declined answer to it, signed before the condition held (read on what that
// answer saw, at its own date); it binds only her
function letGo(t, pool, seen) {
  if (t.state.condition === undefined) return false;
  const heldAt = (a) => {
    if (reading.has(t.hash)) return false;
    const past = pool.past(a.hash);
    reading.add(t.hash);
    try { return Bytes.conditionHolds(t.state.condition, pool.all().filter(b => past.has(b.hash) && seen(b.hash)), Basics.isStr(a.state.at) ? a.state.at : '') === true; } finally { reading.delete(t.hash); }
  };
  return pool.all().some(a => ((a.type === 'transfer' && (a.state.status === 'stopped' || a.state.status === 'declined')) || isDeclineReading(a)) && seen(a.hash) && a.refs.answers === t.hash && Identity.counts(a, pool) &&
    Check.asList(t.refs.to_owner).includes(speakerOf(a, pool)) && !heldAt(a));
}
// made_from(instance, blocks): each thing written as an output of a counted make that took from it, and so on along the makes (folds.md, What each fold returns). A reading of what the
// reader holds; { not_shown, lacks } when a line it reads is not read whole.
// an output of a make is a thing written by the make's author that names it in `derives_from`; `took` is what the make's draw states (null for all)
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
      if (!m || !isMakeBlock(m) || !Identity.counts(m, pool)) continue;
      for (const o of pool.all()) if (o.type === 'thing' && Check.asList(o.refs.derives_from).includes(m.hash) && o.refs.author === m.refs.author) { out.push({ thing: o.hash, from: x, make: m.hash, took: e.amount ? e.amount : null }); queue.push(o.hash); }
    }
  }
  return out.sort((a, b) => Basics.cmp(a.thing, b.thing) || Basics.cmp(a.make, b.make));
}
function whereNow(thingIn, blocks, seen) {
  const pool = withThing(thingIn, blocks);
  const thing = typeof thingIn === 'string' ? pool.get(thingIn) : pool.get(thingIn.hash) || thingIn;
  seen = seen || new Set();
  if (seen.has(thing.hash) || seen.size >= Basics.READ_DEPTH) return [];
  seen = new Set([...seen, thing.hash]);
  // a move counts when its signer owned the thing where that move stands (the ownership fold of its causal past, as promises.md, Bearer), or
  // holds it for one who did (folds.md, Where a thing is now). A transfer of an amount moves no place (things.md, Transfers).
  const ownedBySigner = t => { const sp = speakerOf(t, pool); return sp != null && ownershipFold(thing, pool, pool.past(t.hash)).owners.some(o => o.owner === sp); };
  const holders = new Set();
  const moves = pool.all().filter(t => t.type === 'transfer' && t.refs.answers === undefined && Check.asList(t.refs.what).includes(thing.hash) && Identity.counts(t, pool) && t.state.amount === undefined);
  for (const t of moves) if (t.refs.to_holder !== undefined && ownedBySigner(t)) holders.add(t.refs.to_holder);
  const placed = moves.filter(t => t.refs.to_place !== undefined && (ownedBySigner(t) || holders.has(speakerOf(t, pool))));
  const maximal = Check.latest(placed, pool);
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
// who holds it: the latest (a causal maximum) counted to_holder transfer of it, signed by an owner or by a holder, that the receiver accepted; several maxima or none fall back to the owner
function holderOf(thingIn, blocks) {
  const pool = withThing(thingIn, blocks), thing = pool.get(typeof thingIn === 'string' ? thingIn : thingIn.hash);
  const own = ownershipFold(thing, pool);
  if (own.not_shown) return own;
  const owners = new Set(own.owners.map(o => o.owner));
  const ok = [], holders = new Set(), done = new Set();
  const moves = pool.all().filter(t => t.type === 'transfer' && t.state.status === undefined && t.refs.answers === undefined && Check.asList(t.refs.what).includes(thing.hash) && t.refs.to_holder !== undefined && Identity.counts(t, pool));
  for (let changed = true; changed;) {
    changed = false;
    for (const t of moves) {
      if (done.has(t.hash)) continue;
      const sp = speakerOf(t, pool), to = Check.asList(t.refs.to_holder)[0];
      if (!(owners.has(sp) || holders.has(sp))) continue;
      if (!pool.all().some(a => a.state.status === 'accepted' && Check.asList(a.refs.answers).includes(t.hash) && Identity.counts(a, pool) && speakerOf(a, pool) === to)) continue;
      done.add(t.hash); ok.push(t); holders.add(to); changed = true;
    }
  }
  const heads = Check.latest(ok, pool);
  return heads.length === 1 ? Check.asList(heads[0].refs.to_holder)[0] : (own.owner === null ? null : own.owner);
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
  const shares = pool.all().filter(b => b.type === 'thing' && b.state.kind === 'share' && b.refs.subject === thing.hash && Identity.counts(b, pool)).sort((a, b) => (a.hash < b.hash ? -1 : 1));
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
  if (!Basics.isStr(t) || !Check.RX.decimal.test(t)) return null;
  const neg = t.startsWith('-'), [w, f = ''] = t.replace(/^-/, '').split('.');
  if (f.length > 9) return null;
  const n = BigInt(w + f.padEnd(9, '0'));
  return neg ? -n : n;
}
function ringOf(b) {
  if (!Basics.isObj(b) || Object.keys(b).length !== 2 || b.type !== 'Polygon' || !Array.isArray(b.coordinates) || b.coordinates.length !== 1 || !Array.isArray(b.coordinates[0]) || b.coordinates[0].length > Basics.P.limits.bound_points) return null;
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
  const found = pool.all().filter(g => g.type === 'grant' && g.state.kind === 'leave' && g.state.status === undefined && g.refs.to === user && g.refs.subject === place.hash && Identity.counts(g, pool) &&
    speakerOf(g, pool) !== null && ownershipFold(place, pool, pool.past(g.hash)).owner === speakerOf(g, pool) && Grants.grantLive(g, pool))
    .sort((a, b) => (Basics.isStr(a.state.at) ? a.state.at : '') < (Basics.isStr(b.state.at) ? b.state.at : '') ? -1 : (Basics.isStr(a.state.at) ? a.state.at : '') > (Basics.isStr(b.state.at) ? b.state.at : '') ? 1 : Basics.cmp(a.hash, b.hash));
  if (!found.length) return null;
  const g = found[0];
  return { of: speakerOf(g, pool), since: Basics.isStr(g.state.at) ? g.state.at : null, expires: g.state.scope && g.state.scope.expires !== undefined ? g.state.scope.expires : null };
}
function useShown(placeIn, blocks, clocks) {
  const pool = withThing(placeIn, blocks);
  const place = pool.get(typeof placeIn === 'string' ? placeIn : placeIn.hash);
  const ks = clocks === undefined || clocks === null ? null : Identity.clocksOf(clocks);
  const by = new Map();
  const records = [];
  for (const b of pool.all()) {
    if (b.type !== 'transform' || b.refs.derives_from !== undefined || b.refs.subject !== place.hash || !Basics.isStr(b.state.use) || !Identity.counts(b, pool)) continue;
    const user = speakerOf(b, pool); if (user === null) continue;
    const date = ks ? Bytes.receivedAt(b.hash, ks, pool) : (Basics.isStr(b.state.at) ? b.state.at : null);
    records.push({ hash: b.hash, user, date });
    if (!by.has(user)) by.set(user, { uses: new Set(), dates: [], bounds: new Map(), resting: null, unreceived: 0, layers: new Set() });
    const u = by.get(user);
    u.uses.add(b.state.use);
    if (Basics.isStr(b.state.layer)) u.layers.add(b.state.layer);
    if (date === null) u.unreceived++; else u.dates.push(date);
    const ring = b.state.bound === undefined ? null : ringOf(b.state.bound);
    if (ring) u.bounds.set(JSON.stringify(b.state.bound.coordinates), ring);
    if (Basics.isStr(b.state.resting) && (u.resting === null || u.resting < b.state.resting)) u.resting = b.state.resting;
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
    if (!Identity.counts(d, pool)) continue;
    const defender = speakerOf(d, pool); if (defender === null) continue;
    for (const r of records) {
      if (!Check.asList(d.refs.defeats).includes(r.hash)) continue;
      const cited = Check.asList(d.refs.derives_from);
      const earlier = records.some(o => cited.includes(o.hash) && o.user === defender && o.hash !== r.hash && o.date !== null && r.date !== null && o.date < r.date);
      const title = cited.some(h => { const t = pool.get(h); return !!t && t.type === 'transfer' && Check.asList(t.refs.what).includes(place.hash) && Check.asList(t.refs.to_owner).includes(defender) && Identity.counts(t, pool); });
      disputes.push({ defeats: d.hash, by: defender, of: r.hash, user: r.user, standing: earlier ? 'earlier_use' : title ? 'title' : 'none' });
    }
  }
  disputes.sort((a, b) => Basics.cmp(a.defeats, b.defeats) || Basics.cmp(a.of, b.of));
  return { clock: ks ? 'clocks' : 'author', users, disputes };
}
Object.assign(module.exports, { WALKED, drawsOn, principalOf, speakerOf, isDeclineReading, isMachineAccept, grantTop, principalOfChain, answerStands, isReadIn, withThing, WHOLE, isInstance, ownershipFold, WalkStopped, setReadLimit, reading, conditionHolds1, madeFromList, whereNow, holderOf, sharesOn, micro, ringOf, mx, useShown });
