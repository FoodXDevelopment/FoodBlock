'use strict';
// The oracle's part for identity (identity.md; blocks.md, Finality; core.md, invariant 3; folds.md, A chain): voices and keys, forks and what counts, a key's chain.
const Basics = require('./basics.cjs');
const Bytes = require('./bytes.cjs');
const Check = require('./check.cjs');
const Circles = require('./circles.cjs');
const Deals = require('./deals.cjs');
const Grants = require('./grants.cjs');
const Wire = require('./wire.cjs');
// ================================================================ the identity fold (identity.md; blocks.md, Finality)
// One pass in causal order, read lazily: for each block, the list standing in its causal past; whether its key is a voice of that list or under one; whether an
// end has reached it (The cut). A block counts (`signed_by_author`) when a key of a standing voice (or a key under one) signed it and no end of the key has reached it;
// that a word WAITS (does not yet stand) is `stands`, and a waiting block is still true here.
const lastOf = a => a[a.length - 1];
const jOf = x => (x === undefined || x === null ? 'null' : Bytes.jcs(x));
function emptyIdentity() { return { signed_by_author: {}, keys: [], voices: [], clocks: null, waiting: [], info: new Map(), keyMap: new Map(), timeline: [], genKey: null, idSuite: 'std', closed: false, kgStands: null, twiceOf: null, reachOf: null, witnessGrantStands: null, endsOfKey: null }; }
function identityFold(id, poolIn) {
  const pool = Check.poolOf(poolIn);
  const key = 'id:' + id;
  if (pool.folds.has(key)) return pool.folds.get(key);
  const res = computeIdentity(id, pool);
  pool.folds.set(key, res);
  return res;
}
function computeIdentity(id, pool) {
  const g = pool.get(id);
  if (!g || g.type !== 'actor' || g.refs.author !== undefined || !Basics.isStr(g.state.public_key_sign)) return emptyIdentity();
  const genKey = g.state.public_key_sign, idSuite = g.state.suite || 'std';
  const all = pool.all();
  let joinIdx = null;
  const authored = all.filter(b => b.refs.author === id && b.hash !== id);
  const authoredSet = new Set(authored.map(b => b.hash));
  const kgs = all.filter(b => Check.keyGrantOf(b, id));
  const lists = kgs.filter(k => Array.isArray(k.state.voices));
  const unders = kgs.filter(k => !Array.isArray(k.state.voices) && Basics.isStr(k.state.public_key_sign));
  const byUpdates = new Map();
  for (const k of lists) { const u = k.refs.updates; if (!byUpdates.has(u)) byUpdates.set(u, []); byUpdates.get(u).push(k); }
  const genesisList = Check.listOfBlock(g, id);
  const info = new Map();
  for (const b of authored) { const s = Check.signerFrom(b, pool); if (s) info.set(b.hash, s); }
  const pastOf = h => pool.past(h);
  const inS = (S, h) => S === null || S.has(h);
  const sKey = S => (S === null ? 'all' : S);
  const memo = { counted: new Map(), chain: new Map(), kg: new Map(), sg: new Map(), twice: new Map() };
  const self = { genKey, idSuite, info };
  const idOf = a => (a === id ? self.fold : identityFold(a, pool));
  // whether a block counts for its own author: read in the author's own fold
  const countedBy = b => (b.refs.author === id ? cb(b.hash) : (Basics.isStr(b.refs.author) ? idOf(b.refs.author).signed_by_author[b.hash] === true : true));
  const hasKey = (list, X) => list.voices.some(v => Basics.isObj(v) && (v.key === X || (Basics.isStr(v.key_hash) && Check.hashNamesKey(v.key_hash, X))));
  const keyAt = (v, X) => Basics.isObj(v) && (v.key === X || (Basics.isStr(v.key_hash) && Check.hashNamesKey(v.key_hash, X)));

  // ---- the standing list: the chain of lists from the genesis, each by a key grant that stands in what is read (null: all given)
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
      out.push({ list: Check.listOfBlock(cands[0].k, id), via: cands[0].k });
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
      Xv = Basics.isStr(v.key) ? v.key : Xv;
    }
    // a stop of the key grant that added it, by its signer or a voice above
    for (const st of all) {
      if (st.refs.updates !== U.hash || st.state.status !== 'stopped' || st.refs.author !== id || !inS(S, st.hash) || !cb(st.hash)) continue;
      const s2 = info.get(st.hash), pl = s2 && placeOfKey(s2.key, standing(pastOf(st.hash)), pastOf(st.hash));
      if (pl && !pl.under && pl.p <= sg.p) return null;
    }
    return sg.p;
  }
  // ---- who signed a key grant, as which voice of the list standing in its own past: { p, kind: key | names, X, voice }
  function kgSigner(k) {
    if (memo.sg.has(k.hash)) return memo.sg.get(k.hash);
    memo.sg.set(k.hash, null);
    const Kp = pastOf(k.hash), Lk = standing(Kp);
    let r = null;
    if (k.refs.author === id) {
      const s = info.get(k.hash);
      if (s && cb(k.hash)) { const pl = placeOfKey(s.key, Lk, Kp); if (pl && !pl.under) r = { p: pl.p, kind: 'key', X: s.key, voice: Lk.voices[pl.p] }; }
    } else if (Basics.isStr(k.refs.author) && k.refs.author !== id && idOf(k.refs.author).signed_by_author[k.hash] === true) {
      const P_ = k.refs.author, i = Lk.voices.findIndex(v => Basics.isObj(v) && Array.isArray(v.names) && v.names.includes(P_));
      if (i >= 0) r = { p: i, kind: 'names', X: null, voice: Lk.voices[i] };
    }
    memo.sg.set(k.hash, r);
    return r;
  }
  // ---- does a block count for its author (signed_by_author)
  // cb: the base count the chain of lists is built from (the key is a voice of the list standing in the block's causal past, or under one); counted adds the cuts that
  // read the chain whole (a suite move; an end a clock's line given before her receipt of the block), so the chain never reads its own cuts
  function cb(h) {
    if (memo.counted.has(h)) return memo.counted.get(h);
    memo.counted.set(h, false); // a loop counts for nothing
    const r = countedNow(pool.get(h));
    memo.counted.set(h, r);
    return r;
  }
  function counted(h) {
    if (!cb(h)) return false;
    const b = pool.get(h);
    // a suite move (identity.md): a key grant that puts a key of another suite in the old key's place cuts by causal order alone: a block of the old key counts only when
    // that key grant has it in its causal past. No clock and no reach is read, and nothing another built on is kept.
    // to a reader who believes the old suite a suite move is an end, read as any end is (below). A reader who no longer believes a suite is not representable in the door (no argument names a belief): not built
    // an end of its key that stands among the blocks given and that it has seen (blocks.md, The cut, Seen)
    const clock = clocksOf(reachClock(b));
    // a key grant by her voice above the key whose `counted_to` is before the block puts it off her line toward every block that does not have it in its past (question 5): it counts for no block that has not built on it
    if (keyEnds(b).some(E => cutByCountedTo(b, E))) return false;
    // an end that names in `counted_to` a block that is this one or has it in its past says this block counts (question 5): it is not cut by that end
    // and (blocks.md, The cut) a block counts as made on the word where the end has it in its past, whatever a clock shows
    const countsBy = E => (Basics.isStr(E.state.counted_to) && (E.state.counted_to === b.hash || pastOf(E.state.counted_to).has(b.hash))) || pastOf(E.hash).has(b.hash);
    // a block joined to no other person's block stands against her own voices' ends when signed; only a
    // `counted_to` before it (above) puts it off her line
    // (read without asking whether each joiner counts, which would ask this block again: a block no other person's block names at all, and
    // that names none, is joined to none)
    // (an end in its own causal past it has seen, and is cut by, alone or not)
    if (!joinedToOther(b)) return !keyEnds(b).some(E => !countsBy(E) && !Check.asList(b.refs.confirms).includes(E.hash) && pastOf(b.hash).has(E.hash));
    return !keyEnds(b).some(E => !countsBy(E) && seenEnd(b, E, clock));
  }
  // whether another person's block names b, or b names one (a receipt or a cutoff joins no one), read once for every block of the pool
  function joinedToOther(b) {
    if (joinIdx === null) {
      joinIdx = { by: new Map(), names: new Map() };
      for (const o of all) {
        if (!Basics.isStr(o.refs.author) || (o.type === 'observe' && (o.state.kind === 'receipt' || o.state.kind === 'cutoff'))) continue;
        joinIdx.by.set(o.hash, o);
        for (const x of joinRefs(o)) { if (!joinIdx.names.has(x)) joinIdx.names.set(x, []); joinIdx.names.get(x).push(o); }
      }
    }
    if ((joinIdx.names.get(b.hash) || []).some(o => o.hash !== b.hash && o.refs.author !== b.refs.author)) return true;
    return joinRefs(b).some(x => { const o = joinIdx.by.get(x); return !!o && o.hash !== b.hash && o.refs.author !== b.refs.author; });
  }
  function cutByCountedTo(b, E) {
    if (!Basics.isStr(E.state.counted_to)) return false;
    const c = pool.get(E.state.counted_to), s = info.get(b.hash);
    if (!c || !s || c.hash === b.hash || c.refs.author !== b.refs.author || pastOf(c.hash).has(b.hash) || joinersOf(b).length) return false; // `counted_to` names a block of hers (of that key, or of the voice above that stood where the key began) (the text does not say; read so)
    const sg = kgSigner(E), Le = standing(pastOf(E.hash)), pl = placeOfKey(s.key, Le, pastOf(E.hash));
    return !!sg && !!pl && sg.p < pl.p;
  }
  function countedNow(b) {
    const s = info.get(b.hash);
    if (!s) return false;
    const S = pastOf(b.hash), L = standing(S);
    if (L.voices.length === 0) return false; // a list with no voice left closes her identity: nothing signed after it counts
    const pl = placeOfKey(s.key, L, S);
    if (!pl) return false;
    if (pl.under && Check.isKeyGrant(b)) return false; // a key under a voice signs no key grant
    return true;
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
    if (B && B.type === 'actor' && B.refs.author === undefined && Check.soundGenesis(B)) spec = { author: B.hash, key: null, after: 0 }; // a person's id names her line, whatever key of her list signs: on_line follows her list
    // a key grant that brings in one key (a key under a voice) names that key's line, whole; any other block, its own key's blocks after it
    else if (B && Check.isKeyGrant(B) && !Array.isArray(B.state.voices) && Basics.isStr(B.state.public_key_sign) && Basics.isStr(B.refs.subject)) spec = { author: B.refs.subject, key: B.state.public_key_sign, after: 0 };
    else if (B && Basics.isStr(B.refs.author) && Number.isInteger(B.state.seq)) { const s = Check.signerFrom(B, pool); if (s) spec = { author: B.refs.author, key: s.key, after: B.state.seq }; }
    lineCache.set(n, spec);
    return spec;
  }
  // a clock's line: that block's key's blocks after it, counted, by seq, read in S (null: all given)
  function lineBlocks(n, S) {
    const spec = lineSpec(n);
    if (!spec) return [];
    return all.filter(x => x.refs.author === spec.author && x.hash !== n && Number.isInteger(x.state.seq) && x.state.seq > spec.after && inS(S, x.hash) && (() => { if (spec.key === null) return true; const s = Check.signerFrom(x, pool); return !!s && s.key === spec.key; })() && (spec.author === id ? cb(x.hash) : idOf(spec.author).signed_by_author[x.hash] === true))
      .sort((a, b) => pastOf(a.hash).size - pastOf(b.hash).size || Basics.cmp(a.hash, b.hash)); // a line is read in its own causal order
  }
  const receiptOn = (line, h) => line.find(x => x.type === 'observe' && x.state.kind === 'receipt' && Check.asList(x.refs.derives_from).includes(h));
  const receiptsOf = (line, h) => line.filter(x => x.type === 'observe' && x.state.kind === 'receipt' && Check.asList(x.refs.derives_from).includes(h));
  const placedEarlier = (x, y) => x !== y && pastOf(y.hash).has(x.hash); // a receipt is before another where the other has it in its causal past; its `at` orders nothing
  // what one line says of a block `b` and an end `E` (null: an end that may yet come): 'passes' (a receipt of b before every receipt of E), 'after' (a receipt of E before a receipt of b, or a receipt of E and none of b), or null.
  // One receipt that names an end and a block shows neither before nor after (D-also); a later receipt of the block on that line is after the end.
  function lineSays(line, b, E) {
    const rb = receiptsOf(line, b.hash), re = E ? receiptsOf(line, E.hash) : [];
    for (const r of rb) {
      if (re.includes(r)) continue; // a tie: neutral
      if (re.some(e => placedEarlier(e, r))) return 'after';
      if (re.every(e => placedEarlier(r, e))) return 'passes';
    }
    return !rb.length && re.length ? 'after' : null;
  }
  // on a clock, `needed` lines must show the reading that widens what a word allows (a block in time, a wait run, a reach run, an end passed); the other reading takes `names` less `needed`, plus one. They never both hold.
  function clockSays(clock, b, E, S) {
    let passes = 0, after = 0;
    for (const n of clock.names) { const v = lineSays(lineBlocks(n, S === undefined ? null : S), b, E); if (v === 'passes') passes++; else if (v === 'after') after++; }
    return { passed: passes >= clock.needed, seen: after >= clock.names.length - clock.needed + 1 };
  }
  // a wait has run (blocks.md, A named clock): `needed` lines each hold her receipt of the word and, after it on the line, a cutoff of the span that runs from that receipt (`refs.derives_from` the receipt, `refs.subject` the word).
  // A cutoff's place is its time; no date is added to a date. 'denied' when `names` less `needed` plus one lines hold, before their closing cutoff, a receipt of a block that sets the word aside (a no, an end); else 'pending'.
  function waitRun(w, wait, clocks, S, blockers) {
    if (Check.isZeroDur(wait)) return 'run';
    const ks = clocksOf(clocks);
    if (!ks) return 'pending';
    let closed = 0, denied = 0;
    for (const n of ks.names) {
      const line = lineBlocks(n, S), rs = receiptsOf(line, w.hash);
      let c = null;
      // a span cutoff states the span as its `when` (a duration, at least the wait: durations are compared, never added to a date) and runs from her receipt, or an earlier such cutoff
      const spanOk = x => Basics.isStr(x.state.when) && !!Check.parseDur(x.state.when) && Check.addDur('2000-01-01T00:00:00.000Z', x.state.when) >= Check.addDur('2000-01-01T00:00:00.000Z', wait);
      const cuts = line.filter(x => x.type === 'observe' && x.state.kind === 'cutoff' && Check.asList(x.refs.subject).includes(w.hash));
      const runsFrom = (x, seenC = new Set()) => { if (seenC.has(x.hash)) return false; seenC.add(x.hash); return Check.asList(x.refs.derives_from).some(h => rs.some(r => r.hash === h) || cuts.some(e => e.hash === h && runsFrom(e, seenC))); };
      const closing = cuts.filter(x => spanOk(x) && rs.some(r => placedEarlier(r, x)) && runsFrom(x));
      c = closing.find(x => !closing.some(o => placedEarlier(o, x))) || null;
      if (!c) continue;
      if (line.some(x => placedEarlier(x, c) && x.type === 'observe' && x.state.kind === 'receipt' && Check.asList(x.refs.derives_from).some(h => blockers.has(h)))) { denied++; continue; }
      closed++;
    }
    return closed >= ks.needed ? 'run' : denied >= ks.names.length - ks.needed + 1 ? 'denied' : 'pending';
  }

  // a voice as a value to compare: who it is (key, key_hash, or names with needed), its suite (std when left out), its wait and its reach
  // a voice as it was is the whole voice: who, its suite, its wait and reach, and the rest it states (its bounds, `passes`, `receives`, `above`)
  const WHO = new Set(['key', 'key_hash', 'names', 'needed', 'suite', 'wait', 'reach']);
  const restOf = (v, drop) => Bytes.jcs(Object.fromEntries(Object.keys(v).filter(f => !WHO.has(f) && f !== drop).sort().map(f => [f, v[f]])));
  const voiceOf = v => (Basics.isObj(v) ? Bytes.jcs({ who: Basics.isStr(v.key) ? ['key', v.key] : Basics.isStr(v.key_hash) ? ['hash', v.key_hash] : ['names', v.names, v.needed === undefined && Array.isArray(v.names) && v.names.length === 1 ? 1 : v.needed], suite: v.suite || 'std', wait: v.wait === undefined ? null : v.wait, reach: v.reach === undefined ? null : v.reach, rest: restOf(v) }) : 'none');
  // a place kept as it was, bar the key in it: a new key there starts with no `passes` (identity.md, A voice changes only what is below it)
  const keptBarKey = (o, n) => {
    if (!Basics.isObj(o) || !Basics.isObj(n) || Array.isArray(o.names) || Array.isArray(n.names) || !(Basics.isStr(n.key) || Basics.isStr(n.key_hash))) return false;
    // the key in it, its suite with it, may change (a key's own key grant is never a suite move: read apart)
    if (jOf(o.wait) !== jOf(n.wait) || jOf(o.reach) !== jOf(n.reach)) return false;
    const sameKey = jOf(o.key) === jOf(n.key) && jOf(o.key_hash) === jOf(n.key_hash);
    return sameKey ? restOf(o) === restOf(n) : n.passes === undefined && restOf(o, 'passes') === restOf(n);
  };
  const sameVoices = (a, b) => a.length === b.length && a.every((v, i) => voiceOf(v) === voiceOf(b[i]));
  // the place another's key grant (or confirm) for her list speaks from in L: the voice of named people its author is one of
  const placeOfOther = (x, L) => { const i = L.voices.findIndex(v => Basics.isObj(v) && Array.isArray(v.names) && v.names.includes(x.refs.author)); return i >= 0 ? i : null; };
  // the place a block of hers or for her list speaks from, in L: { p, under }, or null
  const placeIn = (x, L) => { if (x.refs.author === id) { const s2 = info.get(x.hash), Px = pastOf(x.hash), pl = s2 && placeOfKey(s2.key, L, Px); return pl || null; } const p = placeOfOther(x, L); return p === null ? null : { p }; };
  // a voice above sg's place has signed w (named it in refs.confirms of a counted block): a higher voice of the list (for a key under a voice, its own voice
  // too), or named people `needed` of them
  function aboveSigned(w, sg, S) {
    const rank = sg.under ? sg.p + 1 : sg.p, ids = new Map();
    for (const c of all) {
      if (c.hash === w.hash || !Check.asList(c.refs.confirms).includes(w.hash) || !inS(S, c.hash) || !countedBy(c)) continue;
      const Lc = standing(pastOf(c.hash)), pl = placeIn(c, Lc);
      if (!pl || pl.under || !(pl.p < rank)) continue;
      const v = pl.p >= 0 ? Lc.voices[pl.p] : null;
      if (!(Basics.isObj(v) && Array.isArray(v.names))) return true;
      if (!ids.has(pl.p)) ids.set(pl.p, new Set());
      ids.get(pl.p).add(c.refs.author);
      const need = Number.isInteger(v.needed) ? v.needed : (v.names.length === 1 ? 1 : null);
      if (need !== null && ids.get(pl.p).size >= need) return true;
    }
    return false;
  }
  // ---- the second signature (rule 13) for a word w signed as sg in the list L, read in S (identity.md, When a key grant stands): a voice above signs it; or the
  // same key (for a voice of named people, `needed` of them, each having signed it before) signs it again with the closing of the wait in its causal past. A "no"
  // (nos) on one clock's line before her closing cutoff, or in a second signing's causal past, sets it aside: { never }. Else it waits: on `wait` while the wait has
  // not run on her clock, then on `confirm`.
  function twice(w, sg, L, S, nos) {
    if (aboveSigned(w, sg, S)) return { stands: true };
    const wait = sg.p === 0 ? 'PT0S' : (Basics.isObj(sg.voice) ? sg.voice.wait : undefined);
    if (wait === undefined) return { stands: false, on: 'confirm' }; // a voice that states no wait brings in nothing by itself
    const zero = Check.isZeroDur(wait), blockers = new Set(nos.map(N => N.hash));
    // at PT0S a word of a key stands when signed; the second signing is her choice, as a wait above zero
    // a first voice or a voice at PT0S signs a key grant or hand-over once, not twice (the text does not say; read so)
    if (zero && sg.kind !== 'names') return { stands: true };
    const onClock = Sx => waitRun(w, wait, L.clocks, Sx, blockers);
    if (!zero && onClock(S) === 'denied') return { never: true, stands: false };
    const mine = c => (sg.kind === 'names' ? sg.voice.names.includes(c.refs.author) : (c.refs.author === id && !!info.get(c.hash) && info.get(c.hash).key === sg.X));
    const again = all.filter(c => c.hash !== w.hash && Check.asList(c.refs.confirms).includes(w.hash) && inS(S, c.hash) && (c.refs.author === id ? counted(c.hash) : countedBy(c)) && mine(c)); // a second signing her key made after an end of it counts for nothing (as the core reads it)
    if (again.some(c => nos.some(N => pastOf(c.hash).has(N.hash)))) return { never: true, stands: false };
    const after = c => zero || onClock(pastOf(c.hash)) === 'run';
    if (sg.kind === 'names' && zero) {
      // at PT0S a voice of other people speaks once `needed` of them have signed it (the word, or a confirm of it), each once
      const v = sg.voice, need = Number.isInteger(v.needed) ? v.needed : (v.names.length === 1 ? 1 : null);
      const ids = new Set(again.map(c => c.refs.author));
      if (v.names.includes(w.refs.author)) ids.add(w.refs.author);
      if (need !== null && ids.size >= need) return { stands: true };
    } else if (sg.kind === 'names') {
      const v = sg.voice, need = Number.isInteger(v.needed) ? v.needed : (v.names.length === 1 ? 1 : null);
      // each of them signs it twice: the key grant itself or an earlier confirm of theirs in this one's causal past, then this one after the wait
      const ids = new Set(again.filter(c => after(c) && (c.refs.author === w.refs.author || again.some(e => e !== c && e.refs.author === c.refs.author && pastOf(c.hash).has(e.hash)))).map(c => c.refs.author));
      if (need !== null && ids.size >= need) return { stands: true };
    } else if (again.some(after)) return { stands: true };
    return { stands: false, on: !zero && onClock(S) !== 'run' ? 'wait' : 'confirm' };
  }
  // a voice restates every voice above its place as it was, and its own place as it was, bar the key in it (a voice of named people stays as it was);
  // only the first voice changes clocks; a voice that leaves its own place out adds nothing below it, bar taking itself out
  const aboveVoice = sg => sg.kind === 'names' && Basics.isObj(sg.voice) && sg.voice.above === true && sg.voice.wait !== undefined && !Check.isZeroDur(sg.voice.wait);
  const restates = (k, Lk, sg) => {
    const nv = k.state.voices, ov = Lk.voices, i = sg.p;
    // where her list says so (`above: true`), a voice of other people whose `wait` is above zero may sign a key grant that puts a new key in a place above its own (that place kept as it was, bar its key), or that leaves no voice at all.
    // Only the first voice changes `clocks`, and only the first voice adds or changes a voice of other people. besides the places above it, its own voice and everything below stay as they were. (the text does not say; read so)
    if (aboveVoice(sg) && (nv.length === 0 || !sameVoices(nv.slice(0, i), ov.slice(0, i)))) {
      if (jOf(k.state.clocks) !== jOf(Lk.clocks)) return false;
      if (nv.length === 0) return true;
      if (nv.length !== ov.length || !sameVoices(nv.slice(i), ov.slice(i))) return false;
      for (let j = 0; j < i; j++) if (voiceOf(ov[j]) !== voiceOf(nv[j]) && !keptBarKey(ov[j], nv[j])) return false;
      return true;
    }
    if (nv.length < i || !sameVoices(nv.slice(0, i), ov.slice(0, i))) return false;
    if (i !== 0 && jOf(k.state.clocks) !== jOf(Lk.clocks)) return false;
    if (nv.length === i || sameVoices(nv, ov.filter((_, j) => j !== i))) return true;
    const o = ov[i], n = nv[i];
    if (Basics.isObj(o) && Array.isArray(o.names)) return voiceOf(o) === voiceOf(n);
    return keptBarKey(o, n);
  };
  // taking oneself out: the list is the old one without the signer's own place, the clock unchanged, no key added
  const selfOut = (k, Lk, sg) => sg.p >= 0 && sameVoices(k.state.voices, Lk.voices.filter((_, i) => i !== sg.p)) && jOf(k.state.clocks) === jOf(Lk.clocks) && k.state.public_key_sign === undefined && k.state.shown_key === undefined;
  // a key grant that only narrows (blocks.md, Finality, Signed twice): it adds and shows no key, and its list is the old one with voices left out, each kept one as
  // it was, the clock unchanged
  const narrows = (k, Lk) => {
    if (k.state.public_key_sign !== undefined || k.state.shown_key !== undefined) return false;
    if (!Array.isArray(k.state.voices)) return true;
    if (jOf(k.state.clocks) !== jOf(Lk.clocks)) return false;
    let j = 0;
    return k.state.voices.every(v => { while (j < Lk.voices.length && voiceOf(Lk.voices[j]) !== voiceOf(v)) j++; return j++ < Lk.voices.length; });
  };
  // a "no" (identity.md, Saying no is signing): another key grant stating a list for the same list, counted, by a voice above the grant's signer
  const nosOf = (k, Lk, sg) => (Array.isArray(k.state.voices) ? lists.filter(N => N !== k && N.refs.updates === Lk.hash && countedBy(N) && (() => { const pl = placeIn(N, Lk); return !!pl && !pl.under && pl.p < sg.p; })()) : []);
  // two key grants of one voice, neither in the other's causal past (identity.md, Two by one voice)
  const paired = (k, sg, Lk, S) => kgs.some(k2 => {
    if (k2 === k || !inS(S, k2.hash) || pool.sees(k.hash, k2.hash) || pool.sees(k2.hash, k.hash) || !countedBy(k2)) return false;
    if (k.refs.author === id) return k2.refs.author === id && !!info.get(k2.hash) && info.get(k2.hash).key === sg.X;
    if (k2.refs.author === id || k2.refs.updates !== k.refs.updates || placeOfOther(k2, Lk) !== sg.p) return false;
    // a key grant of a voice of other people is one of a pair only once `needed` of them have signed it or named it in `refs.confirms`
    if (sg.kind === 'names') { const v = sg.voice, need = Number.isInteger(v.needed) ? v.needed : (v.names.length === 1 ? 1 : null); const signers = x => new Set([x.refs.author, ...all.filter(c => Check.asList(c.refs.confirms).includes(x.hash) && v.names.includes(c.refs.author) && countedBy(c)).map(c => c.refs.author)]); return need !== null && signers(k).size >= need && signers(k2).size >= need; }
    return true;
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
    // a key in doubt never decides its own replacement: a key's own key grant is never a suite move; only a voice above a key moves it to a key of another suite
    if (isList && sg.kind === 'key') { const ov = Lk.voices[sg.p], nv = k.state.voices[sg.p]; if (Basics.isObj(ov) && Basics.isObj(nv) && Basics.isStr(ov.key) && Basics.isStr(nv.key) && (Bytes.suiteOfKey(nv.key) || 'std') !== (Bytes.suiteOfKey(ov.key) || 'std')) return never; }
    if (sg.kind === 'names') {
      const v = sg.voice, need = Number.isInteger(v.needed) ? v.needed : (v.names.length === 1 ? 1 : null);
      const ids = new Set([k.refs.author, ...all.filter(c => Check.asList(c.refs.confirms).includes(k.hash) && inS(S, c.hash) && v.names.includes(c.refs.author) && countedBy(c)).map(c => c.refs.author)]);
      if (need === null || ids.size < need) return { stands: false, on: 'confirm' };
    }
    if (isList && selfOut(k, Lk, sg)) return { stands: true, free: true }; // taking oneself out: it stands when signed
    if (paired(k, sg, Lk, S)) return never;
    // no kind of key grant skips the cut, the reach, or the pair rule. A key grant that states only `public_key_encrypt` is a grant of hers: it waits on its key's reach and passes the cut as any grant of that key does, and is not signed twice
    if (!isList && !Basics.isStr(k.state.public_key_sign) && !Basics.isStr(k.state.shown_key) && Basics.isStr(k.state.public_key_encrypt)) return { stands: true };
    // a word that only narrows is not signed twice; a key grant of the people of a voice that reaches above their place is never narrowing
    const reachesAbove = aboveVoice(sg) && isList && (k.state.voices.length === 0 || !sameVoices(k.state.voices.slice(0, sg.p), Lk.voices.slice(0, sg.p)));
    if (!reachesAbove && narrows(k, Lk)) return { stands: true };
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
    if (!Basics.isObj(v) || v.reach === undefined) return { ok: true }; // a voice that states no reach is not read on her clock
    const Sx = S === undefined ? null : S;
    if (aboveSigned(w, { p: pl.p, under: !!pl.under, kind: 'key' }, Sx)) return { ok: true };
    const ends = new Set(lists.filter(E => E !== w && leavesOut(E, s.key)).map(E => E.hash));
    const r = waitRun(w, v.reach, L.clocks, Sx, ends);
    return r === 'run' ? { ok: true } : r === 'denied' ? { ok: false, never: true } : { ok: false };
  }
  // a `key` voice that states `each`, `limit` (and `every`) holds one line with the same bounds as a grant's; a key grant that adds a key under it may pass
  // that key a part (its own `limit`, and an `each` no higher), a draw on the voice's line. A word of that key that moves an amount of hers (a transfer, at its `state.amount`; a key grant that
  // passes a part, at that part) is counted on its key's line; with `every`, the period turns at the cutoffs of her list's clocks whose refs.subject is the block that brought the key in and whose
  // span is no shorter than `every`. A word that does not fit stands only when a voice above that key has said it (`confirm`), and holds nothing on the line.
  const boundAmount = x => (x.type === 'transfer' && x.state.status === undefined ? (Deals.isAmount(x.state.amount) ? x.state.amount : null)
    : Check.isKeyGrant(x) && !Array.isArray(x.state.voices) && x.refs.subject === id && Deals.isAmount(x.state.limit) ? x.state.limit : null);
  function boundsOf(w, depth = 0) {
    const s = info.get(w.hash), a = boundAmount(w);
    if (!s || !a) return { ok: true };
    const Wp = pastOf(w.hash), Ls = standing(Wp), pl = placeOfKey(s.key, Ls, Wp);
    if (!pl) return { ok: true };
    const bounds = pl.under ? (() => { const u = pool.get(w.refs.key); return u ? u.state : null; })() : Ls.voices[pl.p];
    if (!Basics.isObj(bounds) || (bounds.each === undefined && bounds.limit === undefined)) return { ok: true };
    if (Deals.isAmount(bounds.each) && (!Deals.sameKind(a, bounds.each) || Deals.fcmp(Deals.dec(a.value), Deals.dec(bounds.each.value)) > 0)) return { ok: false };
    if (!Deals.isAmount(bounds.limit)) return { ok: true };
    if (!Deals.sameKind(a, bounds.limit) || depth > 64) return { ok: false };
    const brought = Basics.isStr(w.refs.key) ? w.refs.key : id, ks = clocksOf(Ls.clocks);
    const periodOf = x => {
      if (!Basics.isStr(bounds.every) || !ks) return 0;
      const P = pastOf(x.hash);
      return all.filter(c => c.type === 'observe' && c.state.kind === 'cutoff' && Check.asList(c.refs.subject).includes(brought) && Basics.isStr(c.state.when) && Check.parseDur(c.state.when) && Grants.cmpDurations(c.state.when, bounds.every) >= 0 && P.has(c.hash)
        && ks.names.some(n => Bytes.clockLine(n, pool).includes(c))).length;
    };
    const mine = periodOf(w);
    let sum = Deals.F0;
    for (const x of authored) {
      if (x.hash === w.hash || !Wp.has(x.hash) || x.refs.key !== w.refs.key) continue;
      const sx = info.get(x.hash), bx = boundAmount(x);
      if (!sx || sx.key !== s.key || !bx || !Deals.sameKind(bx, bounds.limit) || periodOf(x) !== mine || !boundsOf(x, depth + 1).ok) continue; // a word that waits holds nothing on the line
      sum = Deals.fadd(sum, Deals.dec(bx.value));
    }
    return { ok: Deals.fcmp(Deals.fadd(sum, Deals.dec(a.value)), Deals.dec(bounds.limit.value)) <= 0 };
  }
  function boundsWait(w) {
    if (boundsOf(w).ok) return false;
    const s = info.get(w.hash), Wp = pastOf(w.hash), Ls = standing(Wp), pl = s && placeOfKey(s.key, Ls, Wp);
    return !(pl && aboveSigned(w, { p: pl.p, under: !!pl.under, kind: 'key' }, null));
  }
  // a key grant that leaves a key of hers out of the list it replaces
  const leavesOut = (E, X) => { const old = Check.listOfBlock(pool.get(E.refs.updates), id); return !!old && hasKey(old, X) && !hasKey(Check.listOfBlock(E, id), X); };
  // ---- the cut (blocks.md, The cut) for a block of hers: the ends of its key that stand among the blocks given; for a key under a voice, the stops of the key grant
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
  // a block has seen an end (blocks.md, The cut, Seen): the end is in its causal past, or, where its key names a clock, the lines that show the end before the block are `names` less `needed`, plus one. A block that signs the end again has not seen it: the end stands only by it.
  // blocks.md, Seen: a clock's line shows the end seen where it holds her receipt of the end before her receipt of the block; a line that holds no
  // receipt of the block shows nothing seen; `names` less `needed`, plus one, lines must show it
  const seenOnLine = (clock, b, E) => clock.names.filter(n => { const line = lineBlocks(n, null), rb = receiptsOf(line, b.hash), re = receiptsOf(line, E.hash); return rb.length > 0 && rb.every(r => re.some(e => e === r || placedEarlier(e, r))) && rb.some(r => re.some(e => placedEarlier(e, r))); }).length >= clock.names.length - clock.needed + 1;
  const seenEnd = (b, E, clock) => !Check.asList(b.refs.confirms).includes(E.hash) && (pastOf(b.hash).has(E.hash) || (!!clock && seenOnLine(clock, b, E)));
  // the blocks of other persons a block is joined to : those that name it, and those it names (as her yes), by any ref but `prev`, `after`, `key` and `author`
  const joinRefs = x => Object.entries(x.refs).filter(([k]) => !['author', 'prev', 'key', 'after'].includes(k)).flatMap(([, v]) => Check.asList(v)).filter(Basics.isStr);
  function joinersOf(b) {
    const named = new Set(joinRefs(b));
    const inside = gatheredBy(b);
    return all.filter(o => o.hash !== b.hash && Basics.isStr(o.refs.author) && o.refs.author !== b.refs.author && !inside(o) && (named.has(o.hash) || joinRefs(o).includes(b.hash)) && !(o.type === 'observe' && (o.state.kind === 'receipt' || o.state.kind === 'cutoff')) && countedBy(o)); // a clock's receipt or cutoff is the clock's reading, no block joined to the word (the text does not say; read so)
  }
  // for a block `as` a circle, a move's signer is all its hands together: no signer of one of its hands, no tool of hers (the holder of a
  // grant she signed in her own name) and no one under a grant she gave is "another person" joined to it. Read from the blocks alone (who confirms it), so the identity fold
  // never asks the circle's rows: a confirm of the move by anyone is one of its hands.
  function gatheredBy(b) {
    if (!Basics.isStr(b.refs.as) || !Circles.isFoundingCircle(pool.get(b.refs.as))) return () => false;
    const signers = new Set([b.refs.author, ...all.filter(o => Check.asList(o.refs.confirms).includes(b.hash) && Basics.isStr(o.refs.author)).map(o => o.refs.author)]);
    const given = all.filter(g => g.type === 'grant' && g.state.status === undefined && signers.has(g.refs.author) && g.refs.as === undefined);
    const tools = new Set(given.flatMap(g => Check.asList(g.refs.to))), grants = new Set(given.map(g => g.hash));
    return o => signers.has(o.refs.author) || tools.has(o.refs.author) || (Basics.isStr(o.refs.under) && grants.has(o.refs.under));
  }
  // a block passes an end E of its key (or, with E null, the ends that may yet come) when
  // - the end has it in its past (inside the cut); or
  // - another person's block is joined to it and has not seen the end (where the key names a clock: the clocks' receipts of the block, given in that block's past, state that no end is before it, `needed` of them); or
  // - it is joined to no other person's block (it names none, and none names it as her yes): it stands against those ends when signed, bar a key grant by a voice above its key whose `counted_to` is before it, which puts it off her line
  // toward every block that does not have it in its past (question 5). "toward every block that does not have it in its past" is read at a block that is joined to it: a joiner that has it in its past keeps it. (the text does not say; read so)
  function passesEnd(b, E, clock) {
    if (E && (E.hash === b.hash || pastOf(E.hash).has(b.hash))) return true;
    const joiners = joinersOf(b);
    if (!joiners.length) {
      if (E && cutByCountedTo(b, E)) return false;
      return true;
    }
    return joiners.some(o => (clock ? clockSays(clock, b, E, pastOf(o.hash)).passed : E ? !pastOf(o.hash).has(E.hash) : true));
  }
  // 'never' when it has seen an end, 'passed' when it has passed each, else 'waiting'
  function cutOf(b) {
    // an end whose `counted_to` is this block or has it in its past says this block counts (question 5): it is not an end for it
    const ends = keyEnds(b).filter(E => !(Basics.isStr(E.state.counted_to) && (E.state.counted_to === b.hash || pastOf(E.state.counted_to).has(b.hash)))), clock = clocksOf(reachClock(b));
    if (ends.some(E => seenEnd(b, E, clock))) return 'never';
    return (ends.length ? ends.every(E => passesEnd(b, E, clock)) : passesEnd(b, null, clock)) ? 'passed' : 'waiting';
  }
  // the clock a word of hers reads its ends on: the list's clocks, when the voice of its key states a reach (the key names a clock exactly then: identity.md, Ending a key)
  function reachClock(w) {
    const s = info.get(w.hash);
    if (!s) return null;
    const Wp = pastOf(w.hash), L = standing(Wp), pl = placeOfKey(s.key, L, Wp), v = pl && L.voices[pl.p];
    return Basics.isObj(v) && v.reach !== undefined ? L.clocks : null;
  }
  // ---- what the fold gives
  const authoredProxy = new Proxy({}, {
    get: (_, h) => (typeof h !== 'string' ? undefined : h === id ? true : authoredSet.has(h) ? counted(h) : undefined),
    has: (_, h) => typeof h === 'string' && (h === id || authoredSet.has(h)),
    ownKeys: () => [id, ...authored.map(b => b.hash)],
    getOwnPropertyDescriptor: (_, h) => (typeof h === 'string' && (h === id || authoredSet.has(h)) ? { enumerable: true, configurable: true, writable: true, value: h === id ? true : counted(h) } : undefined),
  });
  const keyMap = new Map([[genKey, { via: null }]]);
  for (const k of kgs) for (const c of Check.keysBroughtBy(k, id)) if (!keyMap.has(c.key)) keyMap.set(c.key, { via: k });
  const shownKeys = L => kgs.filter(k => Basics.isStr(k.state.shown_key) && Check.matchHash(L, k.state.shown_key) && info.get(k.hash) && info.get(k.hash).key === k.state.shown_key).map(k => k.state.shown_key);
  // a block of hers one of her clocks received before the cutoffs that closed her close's wait: a line of the clock her list stated
  // at the close holds a receipt of it placed before a cutoff of that close
  const receivedBeforeCloseWait = (h, close) => {
    // her clock: the one the list her close replaces states (`refs.updates` of the close)
    const C = pool.get(close), U = C && Basics.isStr(C.refs.updates) ? pool.get(C.refs.updates) : null;
    const ks = U && Basics.isObj(U.state) ? clocksOf(U.state.clocks) : null;
    if (!ks) return false;
    return ks.names.some(n => {
      const line = lineBlocks(n, null);
      const cuts = line.filter(x => x.type === 'observe' && x.state.kind === 'cutoff' && Check.asList(x.refs.subject).includes(close));
      return receiptsOf(line, h).some(r => cuts.some(c => placedEarlier(r, c)));
    });
  };
  const out = {
    signed_by_author: authoredProxy, info, keyMap, genKey, idSuite, receivedBeforeCloseWait,
    get keys() {
      const L = standing(null), ks = new Set();
      for (const v of L.voices) if (Basics.isObj(v) && Basics.isStr(v.key)) ks.add(v.key);
      for (const X of shownKeys(L)) ks.add(X);
      if (Basics.isStr(genKey) && Check.matchHash(L, genKey)) ks.add(genKey); // her genesis shows its own key, so a hidden voice that names it is a key she has shown
      for (const U of unders) if (!ks.has(U.state.public_key_sign) && underPlace(U, null) !== null) ks.add(U.state.public_key_sign);
      return L.voices.length ? [...ks].sort() : [];
    },
    get voices() { return standing(null).voices; },
    get clocks() { return standing(null).clocks; },
    get closed() { return standing(null).voices.length === 0; },
    // the standing key grants that leave no voice at all (a close, for good)
    get closes() { return chain(null).filter(c => c.via && c.list.voices.length === 0).map(c => c.via.hash); },
    get waiting() {
      // every block of hers, and every key grant for her list, that does not stand yet and may: one entry for each thing it waits on
      const w = [];
      for (const b of [...authored, ...kgs.filter(k => !authoredSet.has(k.hash))]) for (const x of standsOf(b, pool).waiting) w.push(x);
      return w.sort((a, b) => Basics.cmp(a.block, b.block) || Basics.cmp(a.on, b.on));
    },
    get timeline() {
      const ch = chain(null), tl = [], seen = new Set();
      const add = (key, by, voice, under, suite) => { if (seen.has(key)) return; seen.add(key); const E = endsOfKey(key, null)[0]; tl.push({ key, by, voice, under, suite: suite || Bytes.suiteOfKey(key) || 'std', ended: E ? E.hash : null }); };
      add(genKey, id, 0, null, idSuite);
      for (let i = 1; i < ch.length; i++) {
        ch[i].list.voices.forEach((v, p) => { if (Basics.isObj(v) && Basics.isStr(v.key)) add(v.key, ch[i].via.hash, p, null, v.suite); });
        for (const k of kgs) if (Basics.isStr(k.state.shown_key) && Check.matchHash(ch[i].list, k.state.shown_key) && info.get(k.hash) && info.get(k.hash).key === k.state.shown_key) add(k.state.shown_key, k.hash, ch[i].list.voices.findIndex(v => keyAt(v, k.state.shown_key)), null, (Check.matchHash(ch[i].list, k.state.shown_key) || {}).suite);
      }
      for (const U of unders) {
        if (!kgStands(U, null).stands) continue;
        const sg = kgSigner(U);
        if (!sg || sg.kind !== 'key' || seen.has(U.state.public_key_sign)) continue;
        seen.add(U.state.public_key_sign);
        tl.push({ key: U.state.public_key_sign, by: U.hash, voice: null, under: sg.X, suite: U.state.suite || Bytes.suiteOfKey(U.state.public_key_sign) || 'std', ended: underPlace(U, null) === null ? (all.find(st => st.refs.updates === U.hash && st.state.status === 'stopped') || { hash: (endsOfKey(sg.X, null)[0] || {}).hash || null }).hash || null : null });
      }
      const place = e => (e.voice === null || e.voice === undefined ? Number.MAX_SAFE_INTEGER : e.voice); // of one block, by place; a key under a voice last
      return tl.sort((a, b) => pool.past(a.by).size - pool.past(b.by).size || Basics.cmp(a.by, b.by) || place(a) - place(b));
    },
    kgStands: (k, S) => kgStands(k, S === undefined ? null : S), twiceOf, reachOf, boundsOf, boundsWait, reachClock, cutOf, endsOfKey, standingAt: S => standing(S), kgSigner, lineBlocks, receiptOn,
  };
  self.fold = out;
  return out;
}
// clocks { names, needed } (blocks.md, A named clock), checked as written: each name a block id, needed by Counts (a set of one needs none); null when written wrong
function clocksOf(k) {
  if (!Basics.isObj(k) || Object.keys(k).some(x => !Basics.P.shapes.clocks.includes(x))) return null;
  if (!Array.isArray(k.names) || !k.names.length || !k.names.every(n => Basics.isStr(n) && Check.RX.id.test(n)) || k.names.some((n, i) => i && !(k.names[i - 1] < n))) return null;
  if (k.needed === undefined) return k.names.length === 1 ? { names: k.names, needed: 1 } : null;
  return Number.isInteger(k.needed) && k.needed >= 1 && k.needed <= k.names.length ? { names: k.names, needed: k.needed } : null;
}
// ---- Finality (blocks.md): does a word stand. Read on the blocks given, with no clock and no arrival.
// The blocks a block names for its meaning (protocol.json needs: refs.under, answers, updates, for, parent, schema, state.counted_to, a grant's scope.on)
const namedFor = b => {
  const out = [];
  for (const k of ['under', 'answers', 'updates', 'for', 'parent', 'schema']) for (const x of Check.asList(b.refs[k])) if (Basics.isStr(x)) out.push(x);
  if (Basics.isStr(b.state.counted_to)) out.push(b.state.counted_to);
  if (b.type === 'grant' && Basics.isObj(b.state.scope)) for (const x of Check.asList(b.state.scope.on)) if (Basics.isStr(x)) out.push(x);
  return [...new Set(out)];
};
// whether a block is a word that lets another act or spend for her (blocks.md, Finality, Signed twice): a grant (not a key grant or an answer; a kind protocol.json
// does not declare is a label and changes nothing), an account word, a hand-over of a claim (a transfer that names in refs.what a deal, or a claim of invasion)
function givesPower(b, pool) {
  if (b.type === 'observe' && b.state.status === 'resumed' && b.refs.updates !== undefined) return true; // a lift gives her tools their power back, so it waits her voice's `wait`
  if (b.state.status !== undefined || b.refs.answers !== undefined) return false;
  if (b.type === 'grant') return b.state.kind !== 'key';
  if (b.type === 'observe') return b.state.kind === 'account';
  if (b.type === 'transfer') return Check.asList(b.refs.what).some(h => { const c = pool.get(h); return !!c && c.type !== 'thing'; }); // a hand-over of a claim is a transfer that names in `refs.what` any block that is not a `thing`; it moves something of hers, so it waits on its key's `reach`
  return false;
}
// what `stands` lists, in this order (protocol.json door.ops.stands)
const ON = ['wait', 'reach', 'confirm', 'end', 'named', 'hands', 'condition'];
// Finality (blocks.md): does a word stand, read on the blocks given. { stands, waiting: [{ block, on }] }: each thing it waits on, once; empty when it can never stand.
function standsOf(b, poolIn) {
  const pool = Check.poolOf(poolIn);
  pool._stands = pool._stands || new Map();
  const mine = pool.get(b.hash) === b;
  if (mine && pool._stands.has(b.hash)) { const v = pool._stands.get(b.hash); if (v.busy) { if (pool._inCircle) pool._taint = (pool._taint || 0) + 1; return { stands: v.stands, waiting: v.waiting }; } return v; }
  if (mine) pool._stands.set(b.hash, { stands: false, waiting: [{ block: b.hash, on: 'end' }], busy: true }); // asked again from inside itself: not yet (and nothing that read this answer is kept)
  const t0 = pool._taint || 0;
  const r = standsNow(b, pool);
  if (mine) { if ((pool._taint || 0) === t0) pool._stands.set(b.hash, r); else pool._stands.delete(b.hash); }
  return r;
}
function standsNow(b, pool, skipHands) {
  const never = { stands: false, waiting: [] };
  if (b.type === 'actor' && b.refs.author === undefined) return { stands: Check.soundGenesis(b), waiting: [] };
  const author = b.refs.author;
  if (!Basics.isStr(author)) return never;
  const idf = identityFold(author, pool);
  if (idf.signed_by_author[b.hash] !== true && !(pool._assumed && pool._assumed.has(b.hash))) return never;
  const on = new Set();
  // every block it names for its meaning stands
  // no reading of a clock reaches outside the causal past of the block that relies on it: a block it names for its meaning stands as read in that past
  { const names = namedFor(b); if (names.length) { const past = pool.past(b.hash); const sub = names.some(h => { const n = pool.get(h); return n && n.type === 'grant' && Check.isKeyGrant(n); }) ? new Check.Pool(pool.all().filter(x => past.has(x.hash) || x.hash === b.hash)) : pool;
      for (const h of names) { const kgN = (() => { const x = pool.get(h); return !!x && x.type === 'grant' && Check.isKeyGrant(x); })(); const P2 = kgN ? sub : pool; const n = P2.get(h); if (!n || !standsOf(n, P2).stands) on.add('named'); } } }
  const kg = Check.isKeyGrant(b) && b.state.epoch === undefined; // a rekey (profiles/rekeys.md) is her circle's encryption key, not a voice of any list: it stands as any word of its signer does
  let free = false;
  if (kg) {
    if (!Basics.isStr(b.refs.subject)) return never;
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
    if (idf.boundsWait(b)) on.add('confirm'); // a word past its key's line's bounds waits for a voice above that key
    if (!kg && givesPower(b, pool)) { const r = idf.twiceOf(b); if (r.never) return never; if (!r.stands) on.add(r.on); }
  }
  // a block `as` a circle stands only where a row holds for it, or every owner signs it together; until then it waits on `hands`
  if (!skipHands && b.refs.as !== undefined && !Circles.circleHolds(b, pool).holds) on.add('hands');
  // its own condition (promises.md says where it is read): until then it waits on it
  if (b.state.condition !== undefined) on.add('condition');
  return { stands: on.size === 0, waiting: ON.filter(o => on.has(o)).map(o => ({ block: b.hash, on: o })) };
}
// ================================================================ what counts in a fold (core.md invariant 3, folds.md, A fork is a burden)
// A block counts in a fold when its author's identity says a key that speaks signed it, and it is not one of a pair that name
// one prev nor a later block of the same key.
function signerKeyOf(b, pool) {
  const idf = identityFold(b.refs.author, pool);
  const i = idf.info.get(b.hash);
  if (i) return i.key;
  // not yet known to the fold (e.g. a block outside the pool): the key its pieces name that opens it
  const s = Check.signerFrom(b, pool);
  return s ? s.key : null;
}
// ---- in its place. A key has one line. A block is in its place where its `prev` names a block of that key and its `seq` is above that block's, or, for the key's first block, where its
// `prev` names the first block that brought the key in and its `seq` is 1. A block whose `prev` is not given is not shown ('hole'), never out of place. A block whose `prev` names a block of the key with a `seq`
// not below its own, or the first bringer with a `seq` other than 1, is out of its place ('out_of_place'). A block whose `prev` names anything else (a later key grant that brings in the same key, another key's
// block) is off the line ('off'): it is no block of the line and forms no pair. `depth` numbers the steps along the line by `prev` (a fold reads a line in `prev` order; `seq` never orders it).
// of several key grants that bring one key in, the first is the one the others have in their causal past; where no one is first (two apart), none starts the line.
function lineInfoOf(pool) {
  if (pool._li) return pool._li;
  const memo = new Map(), visiting = new Set(), firsts = new Map();
  const bodyAt = h => (pool.body ? pool.body(h) : pool.get(h));
  const seqOf = b => (b && b.state && Number.isInteger(b.state.seq) ? b.state.seq : 0);
  const firstBringer = (author, key) => {
    const k = author + '|' + key;
    if (firsts.has(k)) return firsts.get(k);
    const bs = [];
    for (const e of pool.all()) { const x = bodyAt(e.hash); if (x && (x.hash === author || Check.keyGrantOf(x, author)) && Check.keysBroughtBy(x, author).some(y => y.key === key)) bs.push(x); }
    const mins = bs.filter(x => !bs.some(y => y !== x && pool.sees(x.hash, y.hash)));
    const out = mins.length === 1 ? mins[0] : null;
    firsts.set(k, out);
    return out;
  };
  const keyOf = b => { const k = signerKeyOf(b, pool); return k === null || k === undefined ? null : k; };
  const place = b => {
    if (memo.has(b.hash)) return memo.get(b.hash);
    if (visiting.has(b.hash)) return { s: 'off', depth: 0 };
    visiting.add(b.hash);
    let r;
    const key = keyOf(b), p = Basics.isStr(b.refs.prev) ? pool.get(b.refs.prev) : null;
    if (!p) r = { s: 'hole', depth: 0, lacks: b.refs.prev };
    else if (Basics.isObj(p.refs) && p.refs.author === b.refs.author && p.hash !== b.refs.author && key !== null && keyOf(p) === key) {
      const sub = place(p);
      // reads a block's place from its own `prev` alone: one whose prev is a block of its key with a lower seq is in its place, whatever
      // that block's own place; a hole further back is still a hole
      r = seqOf(b) > seqOf(p) ? { s: sub.s === 'out_of_place' || sub.s === 'off' ? 'on' : sub.s, depth: sub.depth + 1, lacks: sub.lacks } : { s: 'out_of_place', depth: sub.depth + 1 };
    } else {
      const F = key === null ? null : firstBringer(b.refs.author, key);
      r = F && p.hash === F.hash ? (seqOf(b) === 1 ? { s: 'on', depth: 0 } : { s: 'out_of_place', depth: 0 }) : { s: 'off', depth: 0 };
    }
    visiting.delete(b.hash);
    memo.set(b.hash, r);
    return r;
  };
  pool._li = { of: b => (Basics.isObj(b.refs) && Basics.isStr(b.refs.author) && Basics.isStr(b.refs.prev) ? place(b) : { s: 'off', depth: 0 }) };
  return pool._li;
}
// Two headers prove a pair as well as two bodies (folds.md, A fork is a burden); a block counts toward a pair when the identity fold says its key spoke for its author, a header as well as a whole block.
// A pair: two blocks of one key that name one prev or state one seq (core.md, invariant 3), both speaking for their author: a block that does not count for its author (a key that does not
// speak, a block a suite move cut) forms no pair, and neither does a block whose key cannot be told. It needs no line: the two blocks, or their two headers, are the whole proof. Blocks
// of two keys are never a pair (the same prev named by the first blocks of two keys a list brings in is two lines).
function forkPairs(blocksIn) {
  const pool = Check.poolOf(blocksIn);
  // read once per pool (a pool never changes): every fold that asks reads the same pairs
  if (pool._forkPairs) return pool._forkPairs.map(p => [...p]);
  const out = forkPairsIn(pool);
  pool._forkPairs = out.map(p => [...p]);
  return out;
}
function forkPairsIn(pool) {
  const groups = new Map();
  const put = (k, h) => { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(h); };
  for (const b of pool.all()) {
    if (!Basics.isStr(b.refs.author) || !Basics.isStr(b.refs.prev)) continue;
    const idf = identityFold(b.refs.author, pool);
    if (!idf.keyMap.size || idf.signed_by_author[b.hash] !== true) continue;
    const key = signerKeyOf(b, pool);
    if (!key) continue;
    if (lineInfoOf(pool).of(b).s === 'off') continue; // a block off the key's one line is no block of a pair
    put(b.refs.author + '|' + key + '|prev|' + b.refs.prev, b.hash);
    if (Number.isInteger(b.state.seq)) put(b.refs.author + '|' + key + '|seq|' + b.state.seq, b.hash);
  }
  return star(groups.values());
}
// the pairs that prove a group of one key's blocks on one prev or at one seq (nodes.md): a star, each block paired with the group's lowest hash; a pair found twice (one prev and one seq) once
function star(groups) {
  const pairs = new Map();
  for (const list of groups) { const g = [...new Set(list)].sort(); for (const x of g.slice(1)) pairs.set(g[0] + ',' + x, [g[0], x]); }
  return [...pairs.values()].sort((a, b) => Basics.cmp(a[0] + a[1], b[0] + b[1]));
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
    // every block of that key whose `seq` is at or above the lower `seq` of the pair, or that has a block of the pair in its causal past
    for (const x of pool.all()) if (x.refs.author === A.refs.author && (signerKeyOf(x, pool) || x.refs.author) === key && ((x.state.seq || 0) >= from || pool.past(x.hash).has(a) || pool.past(x.hash).has(b))) out.add(x.hash);
  }
  pool._eq = out;
  return out;
}
// whether the block does not count for its author: its key does not speak for her there
function voided(b, pool) { if (pool._assumed && pool._assumed.has(b.hash)) return false; const idf = identityFold(b.refs.author, pool); return idf.keyMap.size > 0 && idf.signed_by_author[b.hash] === false; }
function counts(b, pool) {
  if (!b.refs || !Basics.isStr(b.refs.author)) return true; // actors without an author: their own genesis
  return !voided(b, pool) && !equivocated(pool).has(b.hash);
}
// a fork counts only as a burden (folds.md, A fork is a burden): a block of a forked key voids what the forker claims, never what they owe, nor what
// another built on; the callers read it where the block binds its signer or another's word stands on it
const forkedOnly = (b, pool) => equivocated(pool).has(b.hash) && !voided(b, pool);
// binds(b, pool): the block binds its signer: it counts, or it is a fork's block that is no stop or decline (which would free her by her own word)
const binds = (b, pool) => counts(b, pool) || (forkedOnly(b, pool) && b.state.status !== 'stopped' && b.state.status !== 'declined');

// ================================================================ the chain (nodes.md, folds.md)
// chain(blocks, brought_in): the blocks of one signing key (the caller passes only that key's), with the block that brought the key in (folds.md)
function chainFold(blocksIn, broughtIn) {
  const pool = new Check.Pool(blocksIn, true); // a chain is read as given: its gaps are what it reports
  // the key's blocks are full blocks (protocol.json, door.check_chain): a header given in their place is no block of the chain
  const mine = pool.all().filter(b => b.type !== undefined && b.hash !== broughtIn && Number.isInteger(b.state.seq) && b.state.seq >= 1);
  const own = new Map(mine.map(b => [b.hash, b]));
  const sorted = mine.slice().sort((a, b) => a.state.seq - b.state.seq || Basics.byHash(a, b));
  const skip = b => b.state.skip === true;
  // the pairs (core.md, invariant 3): blocks of the key that name one prev, and blocks of the key that state one seq (two first blocks of one key state seq 1 or name one prev)
  const groups = new Map();
  // a first block takes the key's root, whichever bringer it names (folds.md, chain: it names brought_in, or, at seq 1, a block that is none of the key's
  // blocks given): first blocks are one place
  const placeOf = b => (b.refs.prev === broughtIn || (b.state.seq === 1 && !own.has(b.refs.prev)) ? 'root' : b.refs.prev);
  for (const b of mine) { for (const k of ['prev|' + placeOf(b), 'seq|' + b.state.seq]) { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(b.hash); } }
  const pairs = star(groups.values());
  const inPair = new Set(pairs.flat());
  const gaps = [];
  const skips = mine.filter(skip).map(b => b.hash).sort();
  // a gap: a seq missing before a seq whose blocks are not all skips; the lowest limits.gaps_max are listed (a block may say seq 2^53 - 1)
  const seqs = [...new Set(sorted.map(b => b.state.seq))];
  let last = 0;
  for (const n of seqs) {
    const explained = mine.filter(b => b.state.seq === n).every(skip);
    if (n > last + 1 && !explained) for (let m = last + 1; m < n && gaps.length < Basics.P.limits.gaps_max; m++) gaps.push(m);
    last = n;
  }
  // broken : a block out of its place: its prev names a block of the key whose seq is not below its own, or the block that brought the key in with a seq other than 1. A prev not given is not shown,
  // never out of place; a seq that jumps with no skip is no hole (folds.md, A chain)
  const broken = mine.filter(b => {
    const p = b.refs.prev;
    if (p === broughtIn) return !(b.state.seq === 1);
    const q = own.get(p);
    if (!q) return false;
    return !(b.state.seq > q.state.seq);
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
// the public header (privacy.md): { author, seq, prev, hash }, with `key` when the block names one, and skip when it says so. Of a block given by its header, its own.
const header = b => { const h = { author: b.refs.author, seq: b.state.seq, prev: b.refs.prev, hash: b.hash }; const k = Check.keyRefOf(b); if (k !== undefined) h.key = k; if (b.state.skip === true) h.skip = true; return h; };

// ---- pull filter (nodes.md): exact match on type, kind, author, hash, record, marks and refs; keys AND together
function matches(b, filter, blocksIn) {
  const pool = Check.poolOf(blocksIn);
  if (filter !== undefined && filter !== null && !Basics.isObj(filter)) return false; // a filter that is not an object matches nothing: never fails open
  for (const [k, v] of Object.entries(filter || {})) {
    if (k === 'type') { if (b.type !== v) return false; }
    else if (k === 'kind') { if (b.state.kind !== v) return false; }
    else if (k === 'author') { if (b.refs.author !== v) return false; }
    else if (k === 'hash') { if (b.hash !== v) return false; }
    else if (k === 'record') {
      let cur = b, n = 0, ok = false;
      while (cur && n++ < 1000) { if (cur.hash === v) { ok = true; break; } cur = cur.refs.updates ? pool.get(cur.refs.updates) : null; }
      if (!ok) return false;
    } else if (k === 'marks') { if (!Basics.isObj(v) || !Check.asList(b.state.marks).some(m => Basics.isObj(m) && m.scheme === v.scheme && m.value === v.value)) return false; }
    else if (k === 'refs') { if (!Basics.isObj(v)) return false; for (const [rk, rv] of Object.entries(v)) if (!Basics.isStr(rv) || !Check.asList(b.refs[rk]).includes(rv)) return false; }
    else return false; // a key the filter does not know matches nothing
  }
  return true;
}

// ---- a push (nodes.md, Push): every block is judged on its pieces against what the node holds and the rest of the push, in no rounds, so what is taken never depends on
// the order of a push. One whose pieces are not all there (or whose suite this node does not know) is unjudged, kept and counted in no fold; a valid block is taken; it is then
// read, and one that is not read is listed in `unread` with its codes and given as its header. Two blocks of one key on one prev or at one seq are both kept and listed as a pair:
// the node's own stated choice (takesPairs) says whether the blocks of a pair are taken; if not, none of the push's blocks of a pair is, and such a block is neither refused
// nor unjudged. A pair is a star: each block of the push paired with the lowest hash of its group (folds.md, nodes.md).
const PAIR_CODES = ['unmet', 'unknown_suite'];
// A block whose body is given, and a header that describes a body given, are nothing new and are listed nowhere; a header that does not is `bad_hash` (privacy.md, The public header).
// `unread` lists whole blocks only (a header is not read). An id sent with a block is replaced by the id a reader computes; an unjudged block waiting only on a suite needs [] (nodes.md, Push).
function accept(incomingIn, blocksIn, takesPairs, schemas, keep) {
  const blocks = Check.normEntries(Check.blockList(blocksIn)), refused = [], whole = [], headers = [], wrappedIn = [];
  const open = new Check.Pool([...blocks, ...Check.normEntries((incomingIn || []).filter(x => Basics.isObj(x) && x.type !== undefined))], true); // bodies, to read the suite of the key that signed each
  for (const x of incomingIn || []) {
    if (!Basics.isObj(x)) { refused.push({ hash: '', code: 'shape', detail: 'a message is a block or a sealed block' }); continue; }
    // a wrapped copy is { mailbox, envelope }: no block to judge, a host sees only the mailbox, its size and when; whether it keeps it is its admission rule
    // it is set aside only where the node states an admission rule or names the push; else it is no block, and refused as any other
    if (keep && Object.keys(x).length === 2 && Basics.isStr(x.mailbox) && Basics.isObj(x.envelope)) { wrappedIn.push(x); continue; }
    if (x.type === undefined && x.state === undefined && 'header' in x) {
      // a sealed message: { header, header_signature, envelope }; one that carries a version is refused (privacy.md, Sealed messages)
      if (x.version !== undefined) { refused.push({ hash: '', code: 'shape', detail: 'a sealed block carries no version: it is { header, header_signature, envelope }' }); continue; }
      const e = Check.headerEntry(x);
      if (!e) { refused.push({ hash: '', code: 'shape', detail: 'a sealed block is { header, header_signature, envelope }' }); continue; }
      headers.push(e); continue;
    }
    // a block whose state or refs is not an object is judged by valid as any other (not_canonical: core.md section 8, the bytes), under the id its
    // bytes give
    if (x.type !== undefined && (!Basics.isObj(x.state) || !Basics.isObj(x.refs))) { const f = Check.valid(x, []); let h = ''; try { h = Bytes.hashOfBlock(Check.blockOnly(x), 'std'); } catch { h = Basics.isStr(x.hash) ? x.hash : ''; } refused.push({ hash: h, code: (f[0] || {}).code || 'not_canonical', detail: (f[0] || {}).detail || 'state and refs are objects' }); continue; }
    if (x.type === undefined || !Basics.isObj(x.state) || !Basics.isObj(x.refs)) { refused.push({ hash: Basics.isStr(x.hash) ? x.hash : '', code: 'shape', detail: 'a message is a block or a sealed block' }); continue; }
    // a block's id is the one a reader that holds its pieces computes, in the suite of the key that signed it (core.md, section 2)
    const s = Basics.isStr(x.refs.author) ? Check.signerFrom(x, open) : null;
    const computed = Bytes.hashOfBlock(Check.blockOnly(x), (s && s.suite) || Check.suiteFromBlock(Check.blockOnly(x)));
    // never the id it was sent: a node computes the id itself (the vectors' canonical/relabel case)
    whole.push({ ...x, hash: computed });
  }
  // copies of one block (one id once computed so) are taken once, the lowest signature only to name one
  // where one hash comes more than once in one push, each copy is judged and the valid one is kept: the order of arrival never changes what is taken.
  // where no copy is valid, the copy with the lowest signature is the one refused (one refusal for the id)
  const byId = new Map(), copies = new Map();
  for (const b of whole.sort((p, q) => Basics.cmp(p.hash, q.hash) || Basics.cmp(String(p.signature), String(q.signature)))) { if (!copies.has(b.hash)) copies.set(b.hash, []); copies.get(b.hash).push(b); if (!byId.has(b.hash)) byId.set(b.hash, b); }
  for (const [h, list] of copies) if (list.length > 1) {
    const rest = [...byId.values()].filter(x => x.hash !== h);
    const good = list.find(c => { const c2 = { idx: Check.buildIdx([...blocks, ...rest, c]), memo: new Map(), stack: new Set() }; return Check.judge(c, c2, true).findings.length === 0; });
    if (good) byId.set(h, good);
  }
  const givenBody = new Set(blocks.filter(e => e.type !== undefined).map(e => e.hash));
  const givenHeader = new Map(blocks.filter(e => e.type === undefined).map(e => [e.hash, e]));
  const taken = [], newBlocks = [];
  // a given header that does not describe the body arriving under its hash is a lie about that hash: read as never given, and the block takes its place (privacy.md)
  const describes = (h, b) => h.refs.author === b.refs.author && h.state.seq === b.state.seq && h.refs.prev === b.refs.prev && h.keyId === b.refs.key && (h.state.skip === true) === (b.state.skip === true);
  const lies = new Set();
  for (const b of byId.values()) { if (givenBody.has(b.hash)) continue; const h = givenHeader.get(b.hash); if (h && !describes(h, b)) lies.add(b.hash); newBlocks.push(b); }
  // the other half of a block given: a header whose body is given describes it exactly, or is refused
  const newHeaders = [];
  for (const e of [...new Map(headers.map(h => [h.hash, h])).values()].sort(Basics.byHash)) {
    const body = blocks.find(x => x.type !== undefined && x.hash === e.hash) || byId.get(e.hash);
    if (body) { if (!describes(e, body)) refused.push({ hash: e.hash, code: 'bad_hash', detail: 'the header does not describe the block held under this hash' }); continue; } // one that does is nothing new (privacy.md)
    if (givenHeader.has(e.hash)) continue; // the same header again adds nothing
    newHeaders.push(e);
  }
  const judging = [...newBlocks, ...newHeaders];
  const base = [...blocks.filter(e => !lies.has(e.hash)), ...judging];
  const ctx = { idx: Check.buildIdx(base), memo: new Map(), stack: new Set() };
  const unjudged = [], good = [];
  for (const e of judging) {
    const r = Check.judge(ctx.idx.get(e.hash) || e, ctx);
    if (!r.findings.length) good.push(e);
    else if (r.findings.every(f => PAIR_CODES.includes(f.code))) unjudged.push({ hash: e.hash, needs: r.needs });
    else for (const f of Check.inCodeOrder(r.findings)) refused.push({ hash: e.hash, code: f.code, detail: f.detail });
  }
  // the pairs of the store once the push is taken: those a block of this push belongs to
  const goodSet = new Set(good.map(e => e.hash));
  const after = Check.classify([...blocks.filter(e => !lies.has(e.hash)), ...good]);
  const pairsAll = forkPairs(new Check.Pool([...after.m.values()], true));
  const equivocations = pairsAll.filter(p => p.some(h => goodSet.has(h)));
  const forked = new Set(equivocations.flat().filter(h => goodSet.has(h)));
  for (const e of good) if (takesPairs || !forked.has(e.hash)) taken.push(e);
  // read: each block taken is read against what is given, or is kept as its header
  const finalSet = new Set(taken.map(e => e.hash));
  const r = Check.classify([...blocks.filter(e => !lies.has(e.hash)), ...taken.filter(e => e.type !== undefined || !givenBody.has(e.hash))], { schemas: Array.isArray(schemas) ? Check.blockMap(schemas) : undefined });
  const unread = taken.filter(e => e.type !== undefined && r.codes.has(e.hash)).map(e => ({ hash: e.hash, codes: r.codes.get(e.hash).map(c => c.code) }));
  const asc = (a, b) => Basics.cmp(a.hash, b.hash);
  const res = {
    taken: [...new Map(taken.map(e => [e.hash, e])).values()].sort(asc), unjudged: unjudged.sort(asc), refused: refused.sort((a, b) => Basics.cmp(a.hash, b.hash) || Check.CODE_ORDER.indexOf(a.code) - Check.CODE_ORDER.indexOf(b.code)),
    unread: unread.sort(asc), equivocations, false_headers: [...lies].filter(h => finalSet.has(h)).sort(),
  };
  // in the core's shape: the node's admission rule `copies: { signed?, handed_on?, unsigned?, mailboxes? }` and the push `{ signer?, for? }`.
  // A rule that states nothing keeps no copy. `copies` lists each sealed copy kept, taken or given, for the readers the push names: from `author` (a signed push by its author, under `signed`) or
  // `handed_on` (a signed push by anyone else under `handed_on`, or an unsigned one under `unsigned`; never in the author's place); `wrapped` what it holds of a wrapped copy to a mailbox the rule names
  if (keep) {
    const rule = Basics.isObj(keep.rule) ? keep.rule : {}, push = Basics.isObj(keep.push) ? keep.push : {};
    const says = k => rule[k] === true, mail = Array.isArray(rule.mailboxes) ? rule.mailboxes.filter(Basics.isStr) : [];
    const givenH = new Set(blocks.map(e => e.hash)), forW = Basics.isObj(push.for) ? push.for : {};
    const copies = [];
    for (const x of incomingIn || []) {
      if (!Basics.isObj(x) || x.type !== undefined || !Basics.isObj(x.header) || x.envelope === undefined) continue;
      const hash = x.header.hash;
      if (!(finalSet.has(hash) || givenH.has(hash))) continue;
      const readers = Array.isArray(forW[hash]) ? forW[hash].filter(Basics.isStr) : [];
      if (!readers.length) continue;
      const from = Basics.isStr(push.signer) ? (push.signer === x.header.author ? (says('signed') ? 'author' : null) : (says('handed_on') ? 'handed_on' : null)) : (says('unsigned') ? 'handed_on' : null);
      if (from) copies.push({ hash, for: readers, from });
    }
    res.copies = copies.sort(asc);
    res.wrapped = wrappedIn.filter(m => mail.includes(m.mailbox)).map(m => ({ mailbox: m.mailbox, bytes: Wire.wrappedSeen(m).bytes })).sort((a, b) => Basics.cmp(a.mailbox, b.mailbox) || a.bytes - b.bytes);
  }
  return res;
}

// A block's causal past through the blocks given (sorted): every block reachable by prev, after and every other ref, and by counted_to.
function pastOfBlock(block, blocks) {
  const pool = new Check.Pool(blocks, true);
  const seen = new Set(), stack = Check.refIds(block);
  for (const h of stack) seen.add(h);
  while (stack.length) { const b = pool.get(stack.pop()); if (!b) continue; for (const r of Check.refIds(b)) if (!seen.has(r)) { seen.add(r); stack.push(r); } }
  return [...seen].sort();
}
// ================================================================ a line read whole (folds.md, A chain)
// walkLine(pool, id, start): the line from `id` back by prev until `start` (null: until the line begins), both ends included, each block given, valid and read. `lacks` lists, in the
// order the walk meets them, each block it would need: its id where a given block's prev names it, or where it is given only as its header or not read; and past a block not given,
// { author, key, seq } (`key` the id of the key grant that brought the key in, null for the genesis key) for each seq below the missing one down to the next block of that key
// given, or to the start, the walk going on from that block (none when the block that names the missing one states skip). A seq that jumps with no skip leaves no hole: the line
// is what prev joins. A chain goes on past a key's replacement: at the key grant that brought in a block's key (its prev), the walk goes on from the block that key grant names in
// state.counted_to, else from the key grant itself (the old key signed it). A block not valid is not given.
// Two key grants that continue one line are identity's (a pair of that voice); two accepts or take-ups apart are no pair (folds.md, A chain; What is left, One start): a pair is two blocks of one key on one prev or seq.
function walkLine(pool, id, start, asked) {
  const lacks = [], seen = new Set(), path = [];
  const keyOf = e => { const k = Check.keyRefOf(e); return k === undefined ? null : k; };
  const seqOf = e => (Basics.isObj(e.state) && Number.isInteger(e.state.seq) ? e.state.seq : 0);
  let cur = pool.get(id);
  if (!cur) return { reached: false, ended: false, lacks: [id], path };
  for (;;) {
    if (seen.has(cur.hash)) throw Bytes.argError('the line runs in a ring');
    seen.add(cur.hash); path.push(cur.hash);
    // a block given and not read hides each id in its refs; one given only as its header hides what the key's line given at its place. With a thing asked about, a block given as a body hides only where it names it
    if (cur.type === undefined && !(asked !== undefined && cur._body && !Check.namedIds(cur._body).includes(asked))) lacks.push(cur.hash);
    if (cur.hash === start) return { reached: true, ended: false, lacks, path };
    // a block `as` a circle that names in `state.counted_to` the last block of the old line that counts is read on from that block
    if (Basics.isStr(cur.refs.as) && Basics.isStr(cur.state.counted_to)) { const X = pool.get(cur.state.counted_to); if (X && X.hash !== cur.hash) { cur = X; continue; } if (!X) { lacks.push(cur.state.counted_to); return { reached: cur.state.counted_to === start, ended: false, lacks, path }; } }
    const prev = cur.refs.prev;
    if (!Basics.isStr(prev)) return { reached: false, ended: true, lacks, path };
    const kg = pool.get(prev);
    const next = Check.keyRefOf(cur) === prev && kg && Basics.isObj(kg.state) && Basics.isStr(kg.state.counted_to) ? kg.state.counted_to : prev;
    const n = pool.get(next);
    // a `prev` that names a block of another person (not her genesis, not a key grant about her) leaves her key's line: the walk ends there
    // (a header given under that id naming another author is no block of her line: her block there is not given, and the walk lacks it; a header
    // proves nothing of the block its id names, where a body given and not read shows its author by its own bytes, and leaves her line as any)
    if (n && n.type === undefined && !n._body && Basics.isObj(n.refs) && n.refs.author !== undefined && n.refs.author !== cur.refs.author) { lacks.push(next); return { reached: false, ended: false, lacks, path }; }
    if (n && Basics.isObj(n.refs) && n.refs.author !== undefined && n.refs.author !== cur.refs.author && n.hash !== cur.refs.author && !(n.type === 'grant' && n.refs.subject === cur.refs.author)) return { reached: false, ended: true, lacks, path };
    if (n) { cur = n; continue; }
    lacks.push(next);
    if (next === start) return { reached: true, ended: false, lacks, path };
    const author = cur.refs.author, key = keyOf(cur), seq = seqOf(cur);
    const same = e => Basics.isObj(e.refs) && e.refs.author === author && keyOf(e) === key;
    let below = null;
    for (const e of pool.all()) if (same(e) && seqOf(e) >= 1 && seqOf(e) < seq - 1 && (!below || seqOf(e) > seqOf(below))) below = e;
    const st = Basics.isStr(start) ? pool.get(start) : undefined;
    const floor = below ? seqOf(below) : st && same(st) ? seqOf(st) : 0;
    if (cur.state.skip !== true) for (let k = seq - 2, c = 0; k > floor && c < Basics.P.limits.gaps_max; k--, c++) lacks.push({ author, key, seq: k });
    if (!below) return { reached: false, ended: false, lacks, path };
    cur = below;
  }
}
function readWhole(blockId, startId, blocksIn) {
  if (!Basics.isStr(blockId) || !Basics.isStr(startId)) throw Bytes.argError('read_whole names a block and a start by id');
  const pool = Check.poolOf(blocksIn), r = walkLine(pool, blockId, startId);
  if (!r.reached && !r.lacks.length) throw Bytes.argError('the start is not on the block\'s line');
  return { whole: r.reached && !r.lacks.length, lacks: r.lacks };
}

// onLine(block, start, blocks, answer): the shape every fold gives (folds.md, A chain): a fold that reads an order, a sum or what a key had seen answers only on the line it names, read
// whole from the block back to the line's start; otherwise { not_shown: true, lacks } and nothing else. `answer` is the fold's own answer, asked only when the line is whole. Stages 3 to 6
// say which fold reads which line; this is the one rule they all call.
// No fold in this oracle reads an order, a sum or what a key had seen yet (each fold says which line it reads): this helper is the one shape they all give.
function onLine(blockId, startId, blocksIn, answer) {
  const r = readWhole(blockId, startId, blocksIn);
  return r.whole ? answer() : { not_shown: true, lacks: r.lacks };
}
Object.assign(module.exports, { emptyIdentity, identityFold, computeIdentity, clocksOf, ON, standsOf, standsNow, signerKeyOf, lineInfoOf, forkPairs, star, equivocated, voided, counts, forkedOnly, binds, chainFold, nextLink, header, matches, PAIR_CODES, accept, pastOfBlock, walkLine, readWhole, onLine });
