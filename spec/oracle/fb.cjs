'use strict';
// The FoodBlock conformance oracle, written from the spec text alone (core.md, canonical.md, protocol.md, transport.md, protocol.json,
// modules/*.md, profiles/*.md): plain Node, built-in crypto, no dependency. Where the text is silent a reading is marked "(the text does not
// say; read so)"; where a primitive is not in Node (SM2, SM4-GCM) it is built by hand. This file is its one entry point: the door, one case
// per rule, and every export. Each part holds one spec module: basics.cjs, bytes.cjs, check.cjs, identity.cjs, grants.cjs, circles.cjs,
// deals.cjs, things.cjs, consent.cjs, wire.cjs.
const Basics = require('./basics.cjs');
const Bytes = require('./bytes.cjs');
const Check = require('./check.cjs');
const Circles = require('./circles.cjs');
const Consent = require('./consent.cjs');
const Deals = require('./deals.cjs');
const Grants = require('./grants.cjs');
const Identity = require('./identity.cjs');
const Things = require('./things.cjs');
const Wire = require('./wire.cjs');
// ================================================================ the door: one case per rule
// every argument is JSON as I-JSON writes it: a string holding a lone surrogate is no text, and an argument error (conventions.json door.conventions.text)
const notText = v => (typeof v === 'string' ? Check.lonePair(v) : Array.isArray(v) ? v.some(notText) : Basics.isObj(v) ? Object.entries(v).some(([k, x]) => Check.lonePair(k) || notText(x)) : false);
// no answer depends on the machine. A fold's limits on depth and work are its reader's own; where it stops it answers `not_shown`, with why, and never names an owner. The oracle walks as far as
// Node's stack lets it; where the stack ends it stops. the reason is one entry in `lacks`: { stopped: 'depth' }.
// encoding.md, Limits: a reader reads nothing nested deeper than limits.read_depth, not even a door's arguments
const argsDepth = (x, d = 0) => (d > Basics.READ_DEPTH + 1 ? d : Array.isArray(x) ? Math.max(d + 1, ...x.map(y => argsDepth(y, d + 1))) : Basics.isObj(x) ? Math.max(d + 1, ...Object.values(x).map(y => argsDepth(y, d + 1))) : d);
function door(op, ...a) {
  if (argsDepth(a) > Basics.READ_DEPTH) { const e = new Error('args: nested deeper than ' + Basics.READ_DEPTH); e.kind = 'json'; throw e; }
  try { return doorNow(op, ...a); } catch (e) {
    if (e instanceof Things.WalkStopped && ['ownership', 'ownership_view', 'made_from', 'pot', 'promise_stage', 'promise_view', 'where_now', 'read_whole'].includes(op)) return { not_shown: true, lacks: [e.block, { stopped: 'depth' }] };
    if (e instanceof RangeError && /call stack|too much recursion/i.test(String(e.message)) && ['ownership', 'ownership_view', 'made_from', 'pot', 'promise_stage', 'promise_view', 'where_now', 'read_whole'].includes(op)) return op === 'made_from' ? { not_shown: true, lacks: [{ stopped: 'depth' }] } : { not_shown: true, lacks: [{ stopped: 'depth' }] };
    throw e;
  }
}
function doorNow(op, ...a0) {
  if (op === 'mount') return Wire.mountOp(a0[0], a0[1]);
  if (op === 'unmount') { if (!Wire.isMountId(a0[0]) || !Wire.MOUNTS.has(a0[0])) throw Bytes.argError('unknown_mount'); Wire.MOUNTS.delete(a0[0]); Wire.GONE.add(a0[0]); return true; }
  const a = Wire.mountArgs(a0);
  if (a.some(notText)) throw Bytes.argError('an argument holds a string that is not well-formed text');
  // a list argument (written [...] in the op's args in protocol.json) given as anything but a list, or null, is an argument error: never read as the empty list
  ((Basics.P.door.ops[op] || Basics.C.door.ops[op] || {}).args || []).forEach((spec, i) => {
    if (/^[a-z_]+\??: \[/.test(spec) && a[i] !== undefined && a[i] !== null && !Array.isArray(a[i])) throw Bytes.argError('argument ' + i + ' is a list');
  });
  switch (op) {
    case 'check_chain': return Identity.chainFold(a[0], a[1]);
    case 'fork_pairs': return Identity.forkPairs(a[0]);
    // whether a block is its author's word: read in its input with it given (a block no node would take on what it rests on is no one's word)
    case 'signed_by_author': {
      const b = a[0], pool = Bytes.readWith(a[1], b);
      if (!pool.get(b.hash)) return false;
      if (!Basics.isStr(b.refs && b.refs.author)) return Check.soundGenesis(pool.get(b.hash));
      return Identity.identityFold(b.refs.author, pool).signed_by_author[b.hash] === true;
    }
    case 'header': return Identity.header(a[0]);
    // the opened block in one shape with the core's: { hash, type, state, refs, signature, reveals }
    case 'open_copy': { const m = Wire.openCopy(a[0], a[1]); const b = Check.blockOnly(m.block); return { hash: m.hash, type: b.type, state: b.state, refs: b.refs, signature: m.signature, ...(m.reveals !== undefined ? { reveals: m.reveals } : {}) }; }
    // the ids a block names for its meaning, ascending; with `blocks`, those not given (a block given by its header alone is given)
    case 'needs': { if (a[1] === undefined || a[1] === null) return Check.needsOf(a[0]); const have = new Set(Check.normEntries(Check.blockList(a[1])).map(e => e.hash)); return Check.needsOf(a[0]).filter(h => !have.has(h)); }
    // what a writer refuses to sign, asked of an unsigned draft { type, state, refs }, read against given
    case 'write_refusals': { if (!Basics.isObj(a[0]) || !Basics.isStr(a[0].type)) throw Bytes.argError('argument 0 is a draft: { type, state, refs }'); return Check.writeFindings({ type: a[0].type, state: a[0].state || {}, refs: a[0].refs || {} }, a[1] || []); }
    case 'read': return Check.readFindings(a[0], a[1], a[2]);
    case 'read_whole': return Identity.readWhole(a[0], a[1], a[2]);
    case 'log_shown': return Wire.logShown(a[0], a[1], a[2], a[3]);
    case 'export_whole': return Wire.exportWhole(a[0], a[1], a[2]);
    // the core's own convenience (sdk/door.table): a signed push checked against the keys given
    case 'push_refusals': return Wire.pushRefusals(a[0], a[1]);
    // the third argument may carry the node's admission rule for sealed copies (`copies`), the fifth names the push (`{ signer?, for? }`); with either, the answer adds `copies` and `wrapped`
    case 'accept': { const keep = (Basics.isObj(a[2]) && a[2].copies !== undefined) || (a[4] !== undefined && a[4] !== null) ? { rule: Basics.isObj(a[2]) ? a[2].copies : undefined, push: a[4] } : undefined; const r = Identity.accept(a[0], a[1], Bytes.pairChoice(a[2], 'takes_pairs'), Array.isArray(a[3]) ? a[3] : undefined, keep); return { ...r, taken: r.taken.map(b => b.hash), unread: r.unread }; }
    case 'past_of': return Identity.pastOfBlock(a[0], a[1]);
    case 'sees': return Identity.pastOfBlock(a[0], a[2]).includes(a[1].hash);
    case 'row_holds': return Circles.rowHoldsOp(a[0], a[1]); // row_holds(block, blocks), the circle read from refs.as
    case 'ways_in': return Circles.waysIn(a[0], a[1]);
    case 'speaks_for': return Consent.speaksFor(a[0], a[1]);
    case 'account_of': return Consent.accountOf(a[0], a[1]);
    case 'backed': return Consent.backed(a[0], a[1], a[2]);
    case 'backed_all': return Consent.backedAll(a[0], a[1]);
    case 'to_come_back': return Consent.toComeBack(a[0], a[1]);
    case 'gives': return Consent.gives(a[0], a[1], a[2]);
    // whether a draft { type, state, refs }, signed, would bind anyone: an accept, or a draft whose `gives` of the one whose word it is (refs.as where it is
    // signed as a circle, else refs.author) is not empty. One rule.
    case 'binds': {
      const d = a[0];
      if (!Basics.isObj(d)) throw Bytes.argError('argument 0 is a draft { type, state, refs }');
      // a circle's founding block that states its parts binds its founder: it puts every part in her hand, and is her start for them
      if (Basics.isObj(d.state) && Basics.isObj(d.refs) && Basics.isStr(d.refs.author) && Circles.isFoundingCircle(d) && Circles.packOf(d)) return true;
      const asCircle = Basics.isObj(d.refs) && d.refs.as !== undefined && Basics.isStr(d.refs.author);
      if (Basics.isObj(d.state) && d.state.status === 'accepted' && !asCircle) return true;
      const refs = Basics.isObj(d.refs) ? d.refs : {}, who = Basics.isStr(refs.as) && refs.as !== '' ? refs.as : refs.author;
      if (!Basics.isStr(who)) return false;
      let draft = { type: d.type, state: Basics.isObj(d.state) ? d.state : {}, refs };
      // a draft signed `as` a circle answers as if her hand counts: it is read as a block of her own, in the pool, and binds where her row would hold for it (or every owner signs it)
      if (refs.as !== undefined && Basics.isStr(refs.author)) {
        // her hand is the next block on her own line: a draft that states no `seq` and `prev` is placed after the last block of the key it names (else of her first key) that is given
        const blocks = Check.poolOf(a[1] || []).all();
        if (draft.state.seq === undefined && refs.prev === undefined) {
          const line = blocks.filter(x => x.refs && x.refs.author === refs.author && x.refs.key === refs.key && Number.isInteger(x.state.seq));
          const head = line.sort((x, y) => y.state.seq - x.state.seq)[0];
          const link = Identity.nextLink(head, refs.author);
          draft.state = { ...draft.state, seq: link.seq }; draft.refs = { ...refs, prev: link.prev };
        }
        const pool = new Check.Pool(blocks), hash = Bytes.hashOfBlock(draft, 'std');
        if (!pool.get(hash)) pool.m.set(hash, { hash, ...draft });
        pool._assumed = new Set([hash]); // the draft is read as her signed form would be
        pool.forget();
        if (!Circles.isFoundingCircle(pool.get(refs.as)) || !Circles.circleHolds(pool.get(hash), pool).holds) return false;
        if (draft.state.status === 'accepted') return true;
        return Consent.givesIn({ hash, ...draft }, who, pool).gives.length > 0;
      }
      return Consent.gives(draft, who, a[1] || []).gives.length > 0;
    }
    case 'listing_check': return Consent.listingCheck(a[0], a[1], a[2]);
    case 'check_reads': return Consent.checkReads(a[0], a[1]);
    case 'clearing_applied': return Consent.clearingApplied(a[0], a[1]);
    case 'ruling_honoured': return Consent.rulingHonoured(a[0], a[1]);
    case 'fee_back': return Consent.feeBack(a[0], a[1], a[2]);
    // a threshold read against that many voices (folds.md, Counts); null when it names no count
    case 'count_of': {
      const n = a[0], m = a[1];
      if (!Number.isInteger(m) || m < 0) throw Bytes.argError('members is a whole number');
      if (m === 0) return null;
      return Number.isInteger(n) && n >= 1 && n <= m ? n : null;
    }
    case 'ruling_releases': return Consent.rulingReleases(a[0], a[1], a[2] === undefined || a[2] === null ? null : a[2]);
    case 'circle_state': return Circles.circleState(a[0], a[1], a[2]);
    case 'circle_versions': return Circles.circleVersions(a[0], a[1]);
    case 'circle_key': return Circles.circleKey(a[0], a[1]); // profiles/rekeys.md
    case 'members_then': return Circles.membersThen(a[0], a[1], a[2]);
    // runs `read` first; one rule for a tool's word; a pair on the line gives the fork answer, not false
    case 'why_not_under': { const b = a[0], pool = Bytes.readWith(a[1], b); if (!pool.get(b.hash)) return [{ code: 'not_live', detail: 'the block is no word: it is not valid on what it rests on, or rests on a block not held' }]; return Grants.whyNotUnder(b, pool).map(x => ({ code: x.code, detail: x.detail, ...(x.why ? { why: x.why } : {}), ...(x.pair ? { pair: x.pair } : {}), ...(x.lacks ? { lacks: x.lacks } : {}), ...(x.waiting ? { waiting: x.waiting } : {}) })); }
    case 'under_ok': { const b = a[0], pool = Bytes.readWith(a[1], b); if (!pool.get(b.hash)) return false; const w = Grants.whyNotUnder(b, pool); return w.length === 0 ? true : w[0].code === 'pair' ? w[0].pair : false; }
    case 'keeps_to': return Consent.keepsToOp(a[0], a[1], a[2]);
    case 'meter': return Consent.meterOp(a[0], a[1], a[2]);
    case 'worst_case': return Consent.worstOp(a[0], a[1]);
    case 'lowest_offer': return Consent.lowestOp(a[0], a[1]);
    // a fold asked about a block that is not read gives no answer (folds.md, A fold reads only what is valid and read)
    case 'ownership': { const p = Things.withThing(a[0], a[1]); return p.get(a[0].hash) && Things.isReadIn(a[0], a[1]) ? Things.ownershipFold(a[0], p, undefined, '') : null; } // `ownership` and `pot` take no clock
    case 'ownership_view': { const p = new Check.Pool([a[0], ...Check.poolOf(a[1]).all()]); return p.get(a[0].hash) ? Things.ownershipFold(a[0], p, undefined, '') : null; }
    case 'made_from': { const p = Things.withThing(a[0], a[1]); return p.get(a[0].hash) && Things.isReadIn(a[0], a[1]) ? Things.madeFromList(a[0], p) : null; }
    case 'where_now': { const p = Things.withThing(a[0], a[1]); return p.get(a[0].hash) ? Things.whereNow(a[0], p) : []; }
    case 'shares_on': return Things.sharesOn(a[0], a[1]);
    case 'use_shown': return Things.useShown(a[0], a[1], a[2]);
    case 'not_free_shown': return Deals.notFreeShown(a[0], a[1]);
    case 'invasion_shown': return Deals.invasionShown(a[0], a[1]);
    case 'release_shown': return Bytes.releaseShown(a[0], a[1]);
    case 'pot': return Basics.isObj(a[0]) && !Things.isReadIn(a[0], a[1]) ? null : Deals.potFold(a[0], a[1], ''); // a head that is not read gives no answer (row 106)
    case 'spec': return { protocol: Basics.P, conventions: Basics.C, rule_set: Wire.buildRuleSet() };
    case 'rule_set': return Wire.ruleSet(a[0]);
    case 'public_key_of': return Wire.publicKeyOf(a[0], a[1]);
    case 'push_answer': return Wire.buildPushAnswer(a[0], a[1], a[2], a[3]);
    case 'matches': return Identity.matches(a[0], a[1], a[2]);
    case 'answer_pull': {
      const c = a[4];
      if (!Basics.isObj(c) || !Number.isInteger(c.cap) || c.cap < 1) throw Bytes.argError('choices.cap is a whole number of at least 1: the node states it');
      return Wire.answerPull(a[0], a[1], a[2], a[3], { cap: c.cap, serves_pairs: Bytes.pairChoice(c, 'serves_pairs') }, a[5], a[6], a[7], a[8] === null ? undefined : a[8]);
    }
    case 'keypair': return Bytes.keypair(a[0], a[1]);
    // a writer signs only what its own `read` reads
    // the refusal's kind is the one the core's door gives
    case 'sign': { if (Basics.isObj(a[0]) && a[0].type !== undefined) { const f = Check.writeFindings(a[0]); if (f.length) throw Bytes.cryptoError('sign refuses a block its own read refuses: ' + f.map(x => x.code).join(', ')); } return Bytes.signBlock(a[0], a[1], a[2]); }
    case 'verify': return Bytes.verifyBlock(a[0], a[1], a[2]);
    case 'hash': return Bytes.hashOfBlock({ type: a[0], state: a[1], refs: a[2] }, a[3]);
    case 'valid': return Check.valid(a[0], a[1]);
    case 'base_fields': return Check.baseFields(a[0]);
    case 'merkle_root': return Bytes.merkleRoot(a[0]);
    case 'merkle_proof': return Bytes.merkleProof(a[0], a[1]);
    case 'merkle_verify': return Bytes.merkleVerify(a[0], a[1], a[2], a[3]);
    // read on the blocks in the causal past of the block it is read for (a block, or the id of one given), or on every block given (null);
    // never on a reader's clock. the core runs no named reading (protocol.json `named_readings`): a condition that names one, bare or wrapped, is not read (null)
    case 'condition_holds': {
      const named = c => Basics.isObj(c) && ('without' in c || 'within' in c ? named('without' in c ? c.without : c.within) : (Basics.P.named_readings || []).some(k => k in c));
      const blocks = Check.poolOf(a[1]).all();
      // the arguments are read before the condition: a block it is read for that is not given is an argument error
      const at = a[2] === undefined || a[2] === null ? null : Basics.isStr(a[2]) ? blocks.find(b => b.hash === a[2]) : Basics.isObj(a[2]) ? a[2] : undefined;
      if (at === undefined) throw Bytes.argError('the block it is read for is a block, an id held, or null');
      if (named(a[0])) return null;
      if (at === null) return Bytes.conditionHolds(a[0], blocks);
      const pool = new Check.Pool([at, ...blocks.filter(b => b.hash !== at.hash)]), past = pool.past(at.hash);
      return Bytes.conditionHolds(a[0], blocks.filter(b => past.has(b.hash)));
    }
    case 'terms_total': return Bytes.pureJunk.terms(a[0], a[1]) ? null : Deals.termsTotal(a[0], a[1]);
    case 'add_duration': { if (!(a[2] === undefined || a[2] === null || Number.isInteger(a[2]))) throw Bytes.argError('the sign is a whole number'); return Check.addDur(a[0], a[1], a[2] === undefined || a[2] === null ? 1 : a[2]); }
    // a pull asks from `since` (0 when it names none); anything but an object is a pull of everything from the start (nodes.md, Pull)
    case 'pull_request': { const r = Basics.isObj(a[0]) ? { ...a[0] } : {}; if (r.since === undefined) r.since = 0; return Object.fromEntries(Basics.C.messages.pull.filter(k => k in r).map(k => [k, r[k]])); }
    // a block has waited too long when the node's own time since it arrived passes the node's ttl, in whole milliseconds
    case 'waited_too_long': { if (!Number.isInteger(a[2])) throw Bytes.argError('the time to wait is a whole number of milliseconds'); const s0 = Date.parse(a[0]), n0 = Date.parse(a[1]); return Number.isFinite(s0) && Number.isFinite(n0) && n0 - s0 > a[2]; }
    case 'key_hash': return Check.keyHash(a[0], a[1]);
    case 'salted_hash': return Bytes.saltedHash(a[0], a[1], a[2]);
    case 'wrap': return Wire.wrap(a[0]);
    case 'unwrap': return Wire.unwrap(a[0], Array.isArray(a[1]) ? a[1] : undefined);
    case 'id_of': return Check.idOf(a[0], Array.isArray(a[1]) ? a[1] : undefined);
    case 'seal': if (Basics.isObj(a[3]) && a[3].vectorsOnly !== true && !(Object.keys(a[3]).length === 1 && a[3].pad === true)) throw Bytes.argError('fixed randomness only reproduces a vector: say so with vectorsOnly: true'); return Bytes.seal(a[0], a[1], a[2], a[3]);
    case 'open': return Bytes.open(a[0], a[1]);
    case 'cbor_encode': return Bytes.cborEncode(a[0], a[1]).toString('hex');
    case 'cbor_decode': return Bytes.cborDecode(a[0], Array.isArray(a[1]) ? a[1] : undefined);
    case 'verify_message': return Wire.verifyMessage(a[0], a[1]);
    case 'passkey_challenge': return Bytes.passkeyChallengeOf(a[0]);
    case 'passkey_signature': return Bytes.passkeySignature(a[0], a[1], a[2]);
    case 'suite_of_key': return Bytes.suiteOfKey(a[0]);
    case 'key_timeline': return Identity.identityFold(a[0], a[1]).timeline;
    case 'strict_text': return Check.strictText(a[0]);
    case 'strict_push': return Check.strictPush(a[0]);
    case 'next_link': return Identity.nextLink(a[0], a[1]);
    case 'due': return Deals.due(a[0], Bytes.arrivalsArg(a[1]));
    case 'promise_view': return Deals.promiseView(a[0], a[1], { ...(a[2] || {}), now: Bytes.clock(a[2] && a[2].now) });
    // many deals of one store, each read as promise_view reads it
    case 'promise_views': { const pool = Check.poolOf(a[1]); const now = Bytes.clock(a[2] && a[2].now); return Object.fromEntries(Check.asList(a[0]).map(h => { const f = pool.get(h); return [h, f ? Deals.promiseView(f, pool, { now }) : null]; })); }
    // the keys that may sign a request (nodes.md, Messages): the keys of standing voices and keys under them that no standing key grant has ended
    case 'live_keys': return Identity.identityFold(a[0], a[1]).keys;
    case 'identity_state': { const f = Identity.identityFold(a[0], a[1]); return { signed_by_author: { ...f.signed_by_author }, voices: f.voices.map(v => (Basics.isObj(v) ? { ...v, passes: v.passes === true } : v)), // per voice, whether it states that what it signs passes
    clocks: f.clocks, keys: f.keys, waiting: f.waiting }; }
    // blocks.md, Finality, read on the blocks given with no clock and no arrival
    // a value that is no block (no refs) stands for nothing and waits on nothing, as the core reads it
    case 'stands': { const b = a[0]; if (!Basics.isObj(b) || !Basics.isObj(b.refs) || !Basics.isObj(b.state)) return { stands: false, waiting: [] }; const pool = Bytes.readWith(a[1], b); return Identity.standsOf(pool.get(b.hash) || b, pool); }
    case 'short_reply': return Wire.shortReplyText(a[0]);
    case 'short_reply_open': return Wire.shortReplyOpen(a[0], a[1], a[2]);
    // the first promise is a full block (protocol.json, door.promise_stage): an id in its place names no block, and the answer is null, as the core's
    case 'promise_stage': return Basics.isObj(a[0]) ? Deals.promiseStage(a[0], a[1], a[2]) : null;
    case 'consent': return Consent.consentFold(a[0], a[1], a[2], Basics.isObj(a[3]) ? a[3] : null);
    case 'admission_refusals':
      if (a.length < 4 || !(a[3] === null || Basics.isObj(a[3]))) throw Bytes.argError('admission is the rule\'s state object or an explicit null (no rule): the node states it');
      if (!Number.isInteger(a[4])) throw Bytes.argError('asks_today is a whole number: the node states it');
      return Consent.admissionRefusals(a[0], a[1], a[2], a[3], a[4]);
    case 'is_stranger':
      if (!Basics.isStr(a[0]) || !Basics.isStr(a[1])) throw Bytes.argError('receiver and sender are ids (text)');
      return Consent.isStranger(a[0], a[1], a[2], Basics.isObj(a[3]) ? a[3] : null);
    case 'repeat_occurrences': return Bytes.repeatOccurrences(a[0], a[1], a[2]);
    case 'schemas_from': return Bytes.schemasFrom(a[0]);
    case 'scope_reading': return Consent.scopeReading(a[0]);
    case 'fence_reading':
      if (Check.timeProblem(a[1]) !== null) throw Bytes.argError('at is a time');
      if (a[3] !== undefined && a[3] !== null && Check.timeProblem(a[3]) !== null) throw Bytes.argError('heard is a time or null');
      return Check.fenceReading(a[0], a[1], a[2], a[3]);
    case 'machine_lock': return Check.machineLock(a[0], a[1], Bytes.clock(a[2], false));
    case 'short_code': return Bytes.shortCode(a[0]);
    case 'code_matches': return Bytes.codeMatches(a[0], a[1]);
    case 'residency_refusals': return Consent.residencyRefusals(a[0], a[1]);
    case 'reading_is_persons_claim': return Consent.readingIsPersonsClaim(a[0], a[1], a[2]);
    // read on the readings in the causal past of the block it is read for (a block, or the id of one given), the window ending at
    // that block's own `at` (its signer's word, read against her); a block that states no `at` holds nothing. Never a reader's clock.
    case 'reading_condition_holds': {
      const blocks = Check.poolOf(a[1]).all();
      const at = Basics.isStr(a[2]) ? blocks.find(b => b.hash === a[2]) : Basics.isObj(a[2]) ? a[2] : undefined;
      if (!at) throw Bytes.argError('argument 2 is the block it is read for');
      const pool = new Check.Pool([at, ...blocks.filter(b => b.hash !== at.hash)]), past = pool.past(at.hash);
      if (!Basics.isStr(at.state && at.state.at)) return false;
      return Wire.readingConditionHolds(a[0], blocks.filter(b => past.has(b.hash)), at.state.at);
    }
    // readings (door.classes.reading): the read-back, its words and a second reader's redo (spec/readings/readback, spec/renderers/; library readback/)
    case 'readback': return require('./readback/redo.cjs').make(a[0], a[1], a[2], a[3], a[4]);
    case 'render': return require('./readback/redo.cjs').render(a[0], a[1]);
    case 'readback_redo': return require('./readback/redo.cjs').redo(a[0], a[1]);
    default: throw new Error('the oracle has no op ' + op);
  }
}

// ================================================================ exports
module.exports = {
  P: Basics.P, C: Basics.C, door, jcs: Bytes.jcs, canonical: Bytes.canonical, canonOf: Bytes.canonOf, hashBytes: Bytes.hashBytes, hashStr: Bytes.hashStr, hashOfBlock: Bytes.hashOfBlock, saltedHash: Bytes.saltedHash, keyHash: Check.keyHash, shortCode: Bytes.shortCode, standsOf: Identity.standsOf, shortReplyText: Wire.shortReplyText, shortReplyOpen: Wire.shortReplyOpen, keypair: Bytes.keypair, signBlock: Bytes.signBlock, verifyBlock: Bytes.verifyBlock, verifyBytes: Bytes.verifyBytes, signBytes: Bytes.signBytes,
  setReadLimit: Things.setReadLimit, ruleSet: Wire.ruleSet, buildRuleSet: Wire.buildRuleSet, wrapCopy: Wire.wrapCopy, unwrapCopy: Wire.unwrapCopy, receiptFor: Wire.receiptFor, wrappedSeen: Wire.wrappedSeen, mountOp: Wire.mountOp, seal: Bytes.seal, padPlain: Bytes.padPlain, padSize: Bytes.padSize, open: Bytes.open, suiteOfKey: Bytes.suiteOfKey, encPublicOf: Bytes.encPublicOf, strictText: Check.strictText, strictPush: Check.strictPush, contentFindings: Check.contentFindings, writeFindings: Check.writeFindings, readFindings: Check.readFindings, readWhole: Identity.readWhole, logShown: Wire.logShown, buildPushAnswer: Wire.buildPushAnswer, onLine: Identity.onLine, exportOf: Wire.exportOf, exportWhole: Wire.exportWhole, headerEntry: Check.headerEntry, Pool: Check.Pool, identityFold: Identity.identityFold, addDur: Check.addDur, valid: Check.valid, validStages: Check.validStages,
  cborEncode: Bytes.cborEncode, cborDecode: Bytes.cborDecode, cborHeader: Bytes.cborHeader, cborHeaderDecode: Bytes.cborHeaderDecode, cborEncodePush: Bytes.cborEncodePush, cborDecodePush: Bytes.cborDecodePush, chainFold: Identity.chainFold, forkPairs: Identity.forkPairs, nextLink: Identity.nextLink, header: Identity.header, matches: Identity.matches, accept: Identity.accept,
  whyNotUnder: Grants.whyNotUnder, circleFold: Circles.circleFold, circleState: Circles.circleState, rowHoldsOp: Circles.rowHoldsOp, waysIn: Circles.waysIn, circleVersions: Circles.circleVersions, membersThen: Circles.membersThen, circleKey: Circles.circleKey, countedIn: Circles.countedIn, promiseStage: Deals.promiseStage, promiseView: Deals.promiseView, due: Deals.due, ownershipFold: Things.ownershipFold, whereNow: Things.whereNow, drawsOn: Things.drawsOn, madeFromList: Things.madeFromList, holderOf: Things.holderOf, potFold: Deals.potFold, termsTotal: Deals.termsTotal,
  consentFold: Consent.consentFold, isStranger: Consent.isStranger, speaksFor: Consent.speaksFor, backed: Consent.backed, backedAll: Consent.backedAll, toComeBack: Consent.toComeBack, listingCheck: Consent.listingCheck, checkReads: Consent.checkReads, clearingApplied: Consent.clearingApplied, rulingReleases: Consent.rulingReleases, rulingHonoured: Consent.rulingHonoured, gives: Consent.gives, accountOf: Consent.accountOf, scopeReading: Consent.scopeReading, admissionRefusals: Consent.admissionRefusals, residencyRefusals: Consent.residencyRefusals, readingIsPersonsClaim: Consent.readingIsPersonsClaim, signMessage: Wire.signMessage, verifyMessage: Wire.verifyMessage, pullRefusals: Wire.pullRefusals, pushRefusals: Wire.pushRefusals,
  answerSignedBy: Wire.answerSignedBy, pushAnswer: Wire.pushAnswer, pushRequest: Wire.pushRequest, wellKnownErrors: Wire.wellKnownErrors, wellKnown: Wire.wellKnown, announcement: Wire.announcement, openCopy: Wire.openCopy, headerSignedBy: Wire.headerSignedBy, wrap: Wire.wrap, unwrap: Wire.unwrap, counts: Identity.counts, grantLive: Grants.grantLive,
};
// the envelope's parts, for tools/vectors.cjs alone: it opens a sealed copy in the vectors and seals its new plaintext under the same content key
module.exports.envelopeParts = { agree: Bytes.agree, envKey: Bytes.envKey, gcmSeal: Bytes.gcmSeal, gcmOpen: Bytes.gcmOpen, suiteOfAlg: Bytes.suiteOfAlg };
