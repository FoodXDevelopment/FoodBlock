'use strict';
// What 1.9 changed in the vectors' inputs (changes-1.9/07-last.md section 4, and the stages it reads). tools/vectors.cjs applies it on every
// run; on a file already moved to 1.9 it changes nothing (each step looks for the 1.7 or 1.8 shape it replaces and leaves anything else alone).
// It holds no answer: every answer is the oracle's, checked against the core, after these steps.
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const clone = (x) => JSON.parse(JSON.stringify(x));

// ---- the bytes of a block, as 1.9 writes what 1.7 or 1.8 wrote
// money { minor, currency } is an amount { value, unit } (1.8 stage 3, amounts: "Money is an amount; there is no other shape for it").
// Only the plain shape moves: a malformed money (a bare number, no currency) stays as written, and is read as it is.
const isMoney = (v) => isObj(v) && Object.keys(v).length === 2 && Number.isSafeInteger(v.minor) && v.minor >= 0 && typeof v.currency === 'string' && /^[A-Z]{3}$/.test(v.currency);
// the value in the one form a sum is printed in (encoding.md, A sum): no trailing zero after the point, no point with no fraction
const money = (v) => ({ value: (v.minor / 100).toFixed(2).replace(/\.?0+$/, '') || '0', unit: v.currency });
const amounts = (x) => {
  if (Array.isArray(x)) return x.map(amounts);
  if (!isObj(x)) return x;
  if (isMoney(x)) return money(x);
  // a price per unit { money, per } is { amount, per } (shapes.price_per)
  if (Object.keys(x).length === 2 && isMoney(x.money) && isObj(x.per)) return { amount: money(x.money), per: amounts(x.per) };
  return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, amounts(v)]));
};
// `keepers` is `clocks` everywhere (D15; CORE-SET 3d-3)
const clocks = (x) => {
  if (Array.isArray(x)) return x.map(clocks);
  if (!isObj(x)) return x;
  return Object.fromEntries(Object.entries(x).map(([k, v]) => [k === 'keepers' ? 'clocks' : k, clocks(v)]));
};
function after(body) {
  let state = clone(body.state);
  const refs = clone(body.refs);
  state = clocks(amounts(state));
  // a transfer's `money` is its `state.amount` (things.md: a transfer that names no instance moves its `state.amount`)
  if (isObj(state.money) && !('amount' in state) && isObj(state.money) && 'value' in state.money) { state.amount = state.money; delete state.money; }
  // so is each part of a split: { for, amount } (things.md, A payment for several deals)
  if (Array.isArray(state.split)) state.split = state.split.map((s) => (isObj(s) && isObj(s.money) && 'value' in s.money && !('amount' in s) ? (({ money: m, ...rest }) => ({ ...rest, amount: m }))(s) : s));
  // Job A: `withheld` and `terms.show` leave (07 A1, A5)
  delete state.withheld;
  if (isObj(state.terms)) delete state.terms.show;
  // D6: a machine lock no longer carries how, placer, safe or reach (07 D6, section 4: "machine locks with how, placer, safe or reach")
  if (body.type === 'grant' && state.kind === 'stop') for (const k of ['how', 'placer', 'safe', 'reach']) delete state[k];
  // 1.8 stage 1 (keys): recovery is a voice of her list; a genesis carries no recovery hash or reach
  if (body.type === 'actor' && refs.author === undefined) for (const k of ['recovery_key_hash', 'recovery_reach', 'recovery_suite']) delete state[k];
  if (LEDGER.has(body)) ledgerStrip(state);
  return { type: body.type, state, refs };
}

// ---- fields that 1.8 or 1.9 deleted and that no step above moves: a case whose blocks still carry one is a case for a deleted field
// (each with the decision that deleted it). Read off a block's own bytes, never off an answer.
const DELETED = [
  ['roles', 'circles are owners in parts and rows (1.9 stage 6, 06-circles.md section 6)', (b) => b.state.roles !== undefined],
  ['removal', 'circles are owners in parts and rows (1.9 stage 6)', (b) => b.state.removal !== undefined],
  ['to_role', 'circle roles are gone (1.9 stage 6)', (b) => b.refs.to_role !== undefined || b.state.to_role !== undefined],
  ['witnesses', 'the successor is deleted; a will is her own transfer (D9; CORE-SET 3d-16)', (b) => b.state.witnesses !== undefined],
  ['replaces', 'a key is replaced through her list of voices (1.8 stage 1, keys)', (b) => b.state.replaces !== undefined],
  ['recovery_key', 'recovery is a voice of her list (1.8 stage 1, keys)', (b) => b.state.recovery_key !== undefined],
  ['terms.refrain', 'a refrain is its own promise (1.9 stage 5, promises.md, Refrain)', (b) => isObj(b.state.terms) && b.state.terms.refrain !== undefined],
  ['scope.limit_commitment', 'the sealed limit is removed; the meter answers from blocks (1.9 stage 4)', (b) => isObj(b.state.scope) && b.state.scope.limit_commitment !== undefined],
  ['scope.notice', 'scope.notice leaves the grant (1.9 stage 4, scope_reading)', (b) => isObj(b.state.scope) && b.state.scope.notice !== undefined],
  ['scope.condition', 'scope.condition leaves the grant (1.9 stage 4, scope_reading)', (b) => isObj(b.state.scope) && b.state.scope.condition !== undefined],
  ['scope.sealed', 'scope.sealed leaves the grant (1.9 stage 4, scope_reading)', (b) => isObj(b.state.scope) && b.state.scope.sealed !== undefined],
  ['fence', 'the limit fence is removed (1.9 stage 4)', (b) => b.state.fence !== undefined],
  ['checked', 'a grant check is read from blocks, never a signed `checked` (1.9 stage 4)', (b) => b.state.checked !== undefined],
  ['money', 'money is an amount (1.8 stage 3); a malformed money has no 1.9 form', (b) => b.state.money !== undefined],
  ['consent keep/move', 'consent reads `yes` and `stop` only (07 A3, A5)', (b) => b.state.word === 'keep' || b.state.word === 'move'],
  ['status lifted', 'a lock is not lifted: `lifted` goes (07 D3, D6)', (b) => b.state.status === 'lifted'],
  ['operator grant', 'the operator grant is deleted (DECIDED 1 of 2026-11-11; 1.9 stage 4)', (b) => b.type === 'grant' && b.state.kind === 'operator'],
  ['member grant', 'the member grant kind is gone (1.9 stage 6)', (b) => b.type === 'grant' && b.state.kind === 'member'],
];
const deletedFieldsOf = (body) => DELETED.filter(([, , has]) => { try { return has(body); } catch { return false; } }).map(([name, why]) => ({ name, why }));

// ---- ops: renamed, or asked through another op
const RENAMED = { owed_back: ['to_come_back', 'renamed (D12; CORE-SET 3c-7; 1.9 stage 4 and 5)'] };
// 1.8 stage 2: `check` (the door's `refusals`) is gone; what a writer refuses of a draft is `write_refusals`
function convertOp(c) {
  if (RENAMED[c.op]) return { ...c, op: RENAMED[c.op][0], _why: RENAMED[c.op][1] };
  if (c.op === 'refusals' && typeof c.args[0] === 'string') return { ...c, op: 'write_refusals', args: [{ type: c.args[0], state: c.args[1] || {}, refs: c.args[2] || {} }, c.args[3] || []], _why: 'the door\'s `refusals` is gone: a draft\'s refusals are `write_refusals` (1.8 stage 2, valid and read)' };
  return c;
}

// ---- ops that are gone, and the decision that removed each (a case of an op neither engine answers is deleted with this reason)
const GONE = {
  may_act_as: 'replaced by `row_holds` (1.9 stage 6, 06-circles.md section 6)',
  successor_view: 'the successor is deleted (D9; CORE-SET 3d-16)',
  operators_of: 'the operator grant is deleted (1.9 stage 4; 07 D2)',
  within_limit: 'removed; `meter` answers from blocks (1.9 stage 4, section 4)',
  limit_within_parent: 'removed (1.9 stage 4, section 4)',
  limit_fence: 'removed (1.9 stage 4, section 4)',
  limit_commitment: 'removed (1.9 stage 4, section 4)',
  limit_opens: 'removed (1.9 stage 4, section 4)',
  bids_shown: 'removed (1.8; 1.9 stage 5, section 11)',
  earnest_shape_ok: 'removed (1.8; 1.9 stage 5, section 11)',
  earnest_paid: 'removed (1.8; 1.9 stage 5, section 11)',
  recovery_key_hash: 'recovery is a voice of her list (1.8 stage 1, keys)',
  recovery_reach: 'recovery is a voice of her list (1.8 stage 1, keys)',
  recovery_shown: 'recovery is a voice of her list (1.8 stage 1, keys)',
  accept_sealed: 'a sealed copy is taken by `accept` under the node\'s admission rule (07 A2, A6)',
  receipt_code: 'the short reply is a node\'s own (1.9 stage 7, D2: `short_reply_open`)',
  counted_in: 'ballots are a pattern, read by no op of the protocol (07 C2: profiles move to patterns/); the oracle has no op',
};

// ---- what changed each op's answers, for a renewed case (the stage tables: 04 section 4, 05 section 11, 06 section 6, 07 section 6)
const RENEWED = {
  valid: 'valid reads five things and gives eight codes; a block is signed over its header (1.8 stage 2; CORE-SET 3a)',
  read: 'read names held and read, then check 8 (1.8 stage 2; CORE-SET 3a-13; 07 B5)',
  write_refusals: 'what read refuses of a draft (1.8 stage 2; CORE-SET 3a)',
  strict_text: 'one byte form: members in UTF-8 byte order (CORE-SET 3a)',
  strict_push: '`strict_push` is `{ refused, messages }` (CORE-SET 3a)',
  accept: 'a push judged on pieces; sealed copies under the node\'s admission rule (1.8 stage 2; 07 A2, A6)',
  answer_pull: 'an unsigned asker, or one with no copy, gets no sealed header (07 A2)',
  push_answer: 'a receipt names only what that push added (07 A2)',
  header: 'no `withheld` (07 A5)',
  open_copy: 'no `withheld`; padded plaintexts open (07 A5; CORE-SET 3a-11)',
  seal: 'may pad (07 A1)',
  consent: 'reads `yes` and `stop` only (07 A3)',
  promise_stage: 'no `breached`; `to_come`; R-P counts (1.9 stage 5, section 11; 07 A5)',
  promise_view: '`elapsed` for any promise that moves nothing (1.9 stage 5, section 11)',
  promise_views: '`elapsed` for any promise that moves nothing (1.9 stage 5, section 11)',
  due: 'reads `waits_on` and the condition in the performing block\'s past (1.9 stage 5)',
  ownership: 'no clock argument; holds R-H1 to R-H9 (1.9 stage 5; CORE-SET 3c)',
  ownership_view: 'no clock argument (1.9 stage 5)',
  pot: 'no clock argument (1.9 stage 5)',
  condition_holds: 'no reader\'s clock; `stopped`, `closed`; `settled` and `paid` named readings (1.9 stage 5; 07 D5)',
  reading_condition_holds: 'no reader\'s clock (1.9 stage 5, R-C1)',
  gives: 'a draw on an offer\'s instance is `held`; a tool\'s accept reads as hers (1.9 stages 4 and 5)',
  to_come_back: 'renamed; output `to_come` (D12; 1.9 stages 4 and 5)',
  fee_back: 'output `owed` renamed `to_come` (1.9 stage 5)',
  ruling_releases: 'no reader\'s clock; head ruling in the relying block\'s past (1.9 stage 5, R-H9)',
  clearing_applied: 'line output `to_come`; R-P10 (1.9 stage 5)',
  account_of: '3e-8\'s list (1.9 stage 5)',
  terms_total: '`step`; `n/d` (CORE-SET 3e; 1.9 stage 5)',
  invasion_shown: 'loses standing, crossed, commanded, accused, nothing, up_to (1.9 stage 5)',
  stands: 'a voice\'s each, limit, every; a hand-over of a claim waits on reach; `on: hands` (1.9 stages 4 to 6)',
  identity_state: 'her list of voices (1.8 stage 1; 1.9 stage 4)',
  key_timeline: 'keys under a voice (1.8 stage 1; CORE-SET 3d)',
  signed_by_author: 'her list of voices; a valid block not read still says who signed it (1.8 stage 1; 07, What building changed)',
  live_keys: 'keys under a voice (1.8 stage 1)',
  under_ok: 'G1, one rule; runs `read` first (1.9 stage 4)',
  why_not_under: 'G1, one rule (1.9 stage 4)',
  speaks_for: 'G1; `as` through `row_holds` (1.9 stages 4 and 6)',
  backed: 'a fork on a grant\'s line; `as` through `row_holds` (1.9 stages 4 and 6)',
  backed_all: 'a fork on a grant\'s line (1.9 stages 4 and 6)',
  scope_reading: 'output `{ types, parties, on, limit, each, every, until, clocks, deadline, fallback, junk }` (1.9 stage 4)',
  circle_state: '`{ founder, pack, owners, unissued, rules, clocks, meter }` (1.9 stage 6)',
  circle_versions: '`{ circle, versions, now }` (1.9 stage 6, C19)',
  members_then: 'owners by parts in the block\'s past (1.9 stage 6, C8)',
  count_of: 'a whole number from 1 to the size of the set (1.9 stage 6)',
  circle_key: 'key grants `as` the circle that a row holds for (1.9 stage 6)',
  machine_lock: 'a reading; `{ locked, locks, claimed }`, no `lifted` (07 D6)',
  fence_reading: 'a reading (07 D6)',
  check_chain: 'a line has its place (CORE-SET 3b-1)',
  fork_pairs: 'pairs by one `prev` or one `seq` (1.8 stage 2; CORE-SET 3b)',
  past_of: 'the causal past (CORE-SET 3b)',
  sees: 'the causal past (CORE-SET 3b)',
  needs: 'what a block needs (1.8 stage 2)',
  admission_refusals: 'admission (1.8 stage 2; 07 A2)',
  residency_refusals: 'residency (1.8 stage 2)',
  check_reads: 'unchanged by 1.9; answers follow the re-signed blocks (1.8 stage 2)',
  repeat_occurrences: 'read by G4 (1.9 stage 4)',
  use_shown: 'scope.types (1.8 stage 0)',
  shares_on: 'what is left (1.8 stage 3)',
  where_now: 'the line and its place (CORE-SET 3b)',
  verify: 'a block is signed over its header (1.8 stage 2)',
  hash: 'the canonical form: members in UTF-8 byte order (CORE-SET 3a)',
  key_hash: 'her list of voices (1.8 stage 1)',
  scope_refusals: 'the stage 4 table (1.9 stage 4)',
  release_shown: 'unchanged by 1.9; answers follow the re-signed blocks',
  not_free_shown: 'unchanged by 1.9; answers follow the re-signed blocks',
  listing_check: 'unchanged by 1.9; answers follow the re-signed blocks',
  is_stranger: 'answers follow the re-signed blocks (1.8 stage 2)',
};
const renewReason = (op) => RENEWED[op] || 'the 1.8 and 1.9 rewrites of this op\'s text (CHANGES-1.8.md; changes-1.9/00-shared.md)';

// ---- the invariants' numbers (07 E1): old 1.7/1.8 number -> 1.9 number; "Holds:" ones and old 39 to 43 carry no number, so their tag is dropped
const INVARIANTS = { 1: 1, 2: 2, 3: 3, 25: 4, 29: 5, 8: 6, 19: 7, 11: 8, 12: 9, 13: 10, 14: 11, 15: 12, 22: 13, 32: 14, 6: 15, 7: 16, 9: 17, 10: 18, 23: 19, 27: 20, 26: 21, 4: 22, 5: 23, 37: 24, 38: 25, 31: 26, 20: 27, 17: 28 };

// ---- the story sections become door cases: one shape for every case, an op of the door, its arguments and its answer (07 section 4,
// "every case moves by its op's class"). Each story's blocks go into the arguments whole.
function restructure(V) {
  const out = [];
  const full = (b) => ({ hash: b.hash, ...b.block, ...(b.suite ? { suite: b.suite } : {}), signature: b.signature });
  const blocksOf = (list) => list.map(full);
  const tag = (v) => (Array.isArray(v.invariants) ? { invariants: v.invariants } : {});
  const add = (c) => out.push(c);
  for (const v of V.identities || []) {
    const held = blocksOf(v.blocks);
    for (const b of v.blocks) if (b.hash in (v.signed_by_author || {})) add({ name: `identity: ${v.name}: ${b.name} (signed by its author)`, op: 'signed_by_author', args: [full(b), held], expect: v.signed_by_author[b.hash], exact: true, ...tag(v) });
    if (v.keys) add({ name: `identity: ${v.name}: the keys that speak`, op: 'live_keys', args: [v.id, held], expect: v.keys, exact: true, ...tag(v) });
    for (const [hash, live] of Object.entries(v.under || {})) add({ name: `identity: ${v.name}: ${(v.blocks.find((x) => x.hash === hash) || {}).name || hash} speaks for its grantor`, op: 'under_ok', args: [full(v.blocks.find((x) => x.hash === hash)), held], expect: live, exact: true, ...tag(v) });
  }
  for (const v of [...(V.deals || []), ...((V.folds || {}).promises || [])]) {
    const held = blocksOf(v.blocks);
    add({ name: `promise fold: ${v.name}`, op: 'promise_stage', args: [held.find((b) => b.hash === v.first), held, {}], expect: v.expected, ...tag(v) });
  }
  for (const v of [...(V.circles || []), ...((V.folds || {}).circles || [])]) {
    const held = blocksOf(v.blocks);
    add({ name: `circle fold: ${v.name}`, op: 'circle_state', args: [v.circle, held, null], expect: { members: v.expected.members }, ...tag(v) });
    for (const [hash, ok] of Object.entries(v.may_act || {})) add({ name: `circle fold: ${v.name}: may act as the circle`, op: 'may_act_as', args: [held.find((b) => b.hash === hash), v.circle, held, null], expect: ok, exact: true });
  }
  for (const v of (V.folds || {}).audience || []) { const held = blocksOf(v.blocks); for (const c of v.cases) add({ name: `audience fold: ${c.name}`, op: 'members_then', args: [held.find((b) => b.hash === c.block), c.recipient, held], expect: c.members, exact: true, ...tag(v) }); }
  for (const v of (V.folds || {}).things || []) {
    const held = blocksOf(v.blocks);
    for (const c of v.where) add({ name: `where now: ${c.name}`, op: 'where_now', args: [held.find((b) => b.hash === c.thing), held], expect: c.places, exact: true, ...tag(v) });
    for (const c of v.owners) add({ name: `owner: ${c.name}`, op: 'ownership', args: [held.find((b) => b.hash === c.thing), held], expect: { owner: c.owner }, ...tag(v) });
  }
  for (const v of (V.folds || {}).successors || []) add({ name: `successor: ${v.name}`, op: 'successor_view', args: [blocksOf(v.blocks).find((b) => b.hash === v.grant), blocksOf(v.blocks), v.now, v.arrivals], expect: v.expected });
  for (const v of (V.folds || {}).ballots || []) for (const c of v.cases) add({ name: `ballot: ${c.name}`, op: 'counted_in', args: [blocksOf(v.blocks).find((b) => b.hash === c.result), c.commitment, c.counter], expect: c.counted, exact: true });
  for (const v of (V.folds || {}).rekeys || []) add({ name: `circle key: ${v.name}`, op: 'circle_key', args: [v.circle, blocksOf(v.blocks)], expect: v.expected, ...tag(v) });
  if (V.refusals) {
    const pool = new Map();
    const stories = [...(V.identities || []), ...(V.deals || []), ...(V.circles || []), ...Object.values(V.folds || {}).flat()].map((v) => v.blocks || []);
    for (const list of [...stories, V.refusals.blocks, ...V.refusals.cases.filter((c) => c.blocks).map((c) => c.blocks), (V.sealed || {}).blocks || []]) for (const b of list) pool.set(b.hash, full(b));
    const heldOf = (c) => (Array.isArray(c.held) ? c.held.map((h) => pool.get(h)) : []);
    for (const c of V.refusals.cases) {
      const name = `refused (${c.by}): ${c.name}`, t = tag(c);
      if (c.by === 'check') add({ name, op: 'write_refusals', args: [{ type: c.block.type, state: c.block.state, refs: c.block.refs }, []], codes: c.codes, ...t });
      else if (c.by === 'valid') add({ name, op: 'valid', args: [c.block, heldOf(c)], codes: c.codes, ...t });
      else if (c.by === 'accept') {
        const incoming = c.inline || c.incoming.map((h) => pool.get(h));
        const expect = c.equivocations ? { taken: c.taken, refused: [], equivocations: c.equivocations } : c.taken ? { taken: c.taken } : {};
        add({ name, op: 'accept', args: [incoming, heldOf(c), { takes_pairs: false }, null], expect, ...t });
      } else if (c.by === 'fold') { const held = blocksOf(c.blocks); add({ name, op: 'promise_stage', args: [held.find((b) => b.hash === c.first), held, {}], expect: c.expected, ...t }); }
      else if (c.by === 'may_act_as') { const held = blocksOf(c.blocks); add({ name, op: 'may_act_as', args: [held.find((b) => b.hash === c.block), c.circle, held, null], expect: c.ok, exact: true }); }
      else if (c.by === 'under') add({ name, op: 'under_ok', args: [pool.get(c.block), [...pool.values()]], expect: c.live, exact: true, ...t });
      else if (c.by === 'open') add({ name, op: 'open_copy', args: [c.message, V.keys[c.recipient].x25519_private], error: { code: c.codes[0] }, ...t });
    }
  }
  for (const k of ['identities', 'deals', 'circles', 'folds', 'refusals']) delete V[k];
  return out;
}

// ---- cases whose question is a rule 1.8 or 1.9 deleted (asked of an op that remains): deleted, each with the decision
const isTime = (v) => typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v);
function obsolete(c) {
  // no fold reads a reader's clock (CORE-SET 3c-6; 1.9 stage 5): an answer asked "as of" a time is a question with no 1.9 form
  if (['condition_holds', 'ownership', 'ownership_view', 'pot', 'reading_condition_holds', 'ruling_releases'].includes(c.op) && c.args.slice(2).some(isTime)) return 'no fold reads a reader\'s clock (CORE-SET 3c-6; 1.9 stage 5, section 11)';
  // a block is signed over its header, a genesis over its own bytes (1.8 stage 2): a signature over the bytes of a block with no author is no 1.9 signature
  if (c.op === 'sign' && /a signature over the canonical bytes/.test(c.name || '')) return 'a block is signed over its header (1.8 stage 2, core.md section 2)';
  return null;
}

// ---- the ledger is one block of every type, each valid and read: a block of it that carries a field 1.9 deleted loses that field (its type
// stays shown), so no section of the file asks a writer to sign what its own read refuses
const LEDGER = new WeakSet();
function ledger(V) { for (const v of [...((V.ledger || {}).genesis || []), ...(V.hashes || [])]) if (isObj(v.block)) LEDGER.add(v.block); }
const ledgerStrip = (state) => {
  delete state.roles; delete state.removal;
  if (isObj(state.scope)) { delete state.scope.notice; delete state.scope.condition; delete state.scope.limit_commitment; }
};

// ---- a case says which numbered invariant it shows (core.md, Invariants), read from what it answers, never from its words: a refusal for a
// missing required field or an undeclared one shows 7 (a closed type has its fields and no others); a draw that takes nothing because its
// signer owns none of the measure shows 25 (an amount changes only by a block that speaks for its owner)
function tagInvariants(cases) {
  const add = (c, n) => { const s = new Set(Array.isArray(c.invariants) ? c.invariants : []); if (s.has(n)) return; s.add(n); c.invariants = [...s].sort((a, b) => a - b); };
  const codesOf = (c) => JSON.stringify([c.expect, c.codes, c.subset]);
  for (const c of cases) {
    if (['read', 'valid', 'write_refusals'].includes(c.op) && /"(required|undeclared_field|undeclared_ref)"/.test(codesOf(c))) add(c, 7);
    if (c.op === 'ownership' && /"why":"not_owner"/.test(JSON.stringify(c.expect || ''))) add(c, 25);
  }
}

module.exports = { tagInvariants, ledger, obsolete, after, deletedFieldsOf, convertOp, GONE, renewReason, INVARIANTS, restructure };
