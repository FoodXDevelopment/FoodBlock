'use strict';
// The dealer (changes-1.9/07-last.md D4; changes-1.8/07-last.md, "A dealer"): takes ONE message, a deal's block with its pieces, and answers it.
// It uses only the oracle's public ops (fb.door and the exports below); it speaks no FoodBlock beyond the eight ops of D1.
//
// dealer(text, held, opts) -> { answer, ... }
//   text  the message as bytes: the canonical JSON of { "messages": [ ... ] } (the `.foodblock` attachment, transport.md), optionally with
//         "ids": [ ... ] beside it (the id the sender names for each message, in order; canonical.md "an id sent with it"). Each message is
//         { block, signature } or a sealed copy { header, header_signature, envelope }. Pieces come first, the deal's block LAST: the last
//         message is the one asked about.
//   held  the blocks it keeps (its own line and what it kept of the deal): full blocks.
//   opts  me           its own id (its genesis): which side of the deal it is
//         sign         (type, state, refs) -> the full block its own key signs; called only for a draft its own `read` reads
//         enc_private  its encryption private key (hex), to open a sealed copy
//         received     ids of the payments it counts as received (it counts nothing on the giver's word)
//   It names no clock and reads no profile.
// answers: refused { code, hash } | waits { codes } | not_read { codes } | ask_own_key { for, why } | accepted { stage, total, draft?, signed? }
//          | settled { stage:'done' } | nothing { stage }
const crypto = require('crypto');
const fb = require('./fb.cjs');

// D1: it conforms for these eight ops, and does not speak FoodBlock (it passes no other op's cases).
const conformsFor = ['hash', 'id_of', 'header', 'strict_text', 'verify', 'valid', 'read', 'promise_stage'];
// item 5: the terms it reads. `step` is read too: story 3 (Mama's mandazi) is accepted with total 7 only by reading it.
const READ_TERMS = ['price', 'quantity', 'expires', 'pay_by', 'deliver_by', 'step'];

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const sha = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const door = (...a) => fb.door(...a);
const refused = (code, bytes) => ({ answer: 'refused', code, hash: sha(bytes) });

function dealer(text, held = [], opts = {}) {
  const { me, sign, enc_private: enc, received = [] } = opts;
  // item 1, bytes: a message whose bytes are not the bytes its own writer gives for the same value is refused
  let env;
  try { env = JSON.parse(text); } catch (e) { return refused('not_canonical', String(text)); }
  if (!isObj(env) || fb.jcs(env) !== text) return refused('not_canonical', text);
  if (Object.keys(env).some(k => k !== 'messages' && k !== 'ids') || !Array.isArray(env.messages) || !env.messages.length) return refused('not_canonical', text);
  const ids = env.ids;
  if (ids !== undefined && !(Array.isArray(ids) && ids.length === env.messages.length)) return refused('not_canonical', text);
  const pool = [...held];
  const mine = [];
  for (let i = 0; i < env.messages.length; i++) {
    const m = env.messages[i];
    let full, bodyText;
    try {
      if (isObj(m) && 'envelope' in m) { // a sealed copy: opened with its own key only (nothing fills anyone's silence)
        if (!enc) return { answer: 'waits', codes: ['unmet'], why: 'a sealed copy and no key of its own to open it' };
        const o = door('open_copy', m, enc);
        bodyText = fb.jcs(o.block);
        full = { hash: o.hash, ...o.block, signature: o.signature };
      } else {
        if (!isObj(m) || !isObj(m.block) || Object.keys(m).sort().join() !== 'block,signature') return refused('shape', text);
        bodyText = fb.jcs(m.block);
        full = door('unwrap', m, pool);
      }
    } catch (e) { return refused(e.code || 'shape', text); }
    const bytes = door('strict_text', bodyText);
    if (bytes.length) return refused(bytes[0].code, bodyText);
    // item 2, id: the hash of the bytes as they came; an id the sender names that is not it is bad_hash (valid says so)
    if (ids !== undefined) full = { ...full, hash: ids[i] };
    // item 3, who said it
    const codes = door('valid', full, pool).map(c => c.code);
    if (codes.length) {
      if (codes.every(c => c === 'unmet' || c === 'unknown_suite')) return { answer: 'waits', codes, hash: full.hash }; // a block it cannot open it does not answer
      return refused(codes[0], bodyText);
    }
    pool.push(full); mine.push(full);
  }
  const S = mine[mine.length - 1];
  const get = h => pool.find(b => b.hash === h);
  // item 8, under a grant: it answers only when it can check that grant; otherwise it asks for the same order in her own key
  if (isObj(S.refs) && typeof S.refs.under === 'string') {
    const g = get(S.refs.under);
    const ok = g ? door('under_ok', S, pool) : false;
    if (ok !== true) {
      const principal = g && isObj(g.refs) ? g.refs.author : null;
      return { answer: 'ask_own_key', for: principal, why: g ? door('why_not_under', S, pool).map(x => x.code) : ['grant_not_held'], says: 'send the same order signed by her own key' };
    }
  }
  // item 5, reading: what it does not read it holds not read and does not accept
  const unread = [];
  for (const b of mine) {
    for (const c of door('read', b, pool).map(x => x.code)) unread.push({ hash: b.hash, code: c });
    if (b.type === 'promise') {
      const t = isObj(b.state.terms) ? b.state.terms : {};
      if (Object.keys(t).some(k => !READ_TERMS.includes(k) && k !== 'condition')) unread.push({ hash: b.hash, code: 'term_not_read' });
      if (b.refs.schema !== undefined) unread.push({ hash: b.hash, code: 'schema_not_read' });
    }
    if ((isObj(b.state.terms) && b.state.terms.condition !== undefined) || b.state.condition !== undefined) unread.push({ hash: b.hash, code: 'condition_not_read' });
  }
  if (unread.length) return { answer: 'not_read', codes: [...new Set(unread.map(u => u.code))], blocks: unread };
  // the deal this block belongs to: its first promise
  const dealOf = b => { for (let x = b, n = 0; x && n < 64; n++) { if (x.type === 'promise' && x.refs.answers === undefined) return x; x = get(x.refs.for) || get(x.refs.answers) || get(x.refs.updates); } return null; };
  const first = dealOf(S);
  if (!first) return { answer: 'nothing', why: 'it belongs to no deal it holds' };
  const stageOf = () => door('promise_stage', first, pool, {});
  const say = (st, extra = {}) => ({ answer: st.stage === 'done' ? 'settled' : ['accepted', 'underway'].includes(st.stage) ? 'accepted' : 'nothing', stage: st.stage, total: st.total ? st.total.value : null, paid: st.paid ? st.paid.value : null, ...extra });
  // item 4, its own line: each later block names its last block in `prev` and counts `seq` up by one. It keeps its own blocks only; `at` is the host's word (opts.at): it names no clock.
  const audience = isObj(S.state) && Array.isArray(S.state.audience) ? { audience: S.state.audience, nonce: sha(S.hash).slice(0, 32) } : {};
  const mineNow = () => pool.filter(b => me !== undefined && b.refs && b.refs.author === me && Number.isInteger(b.state.seq)).sort((a, b) => a.state.seq - b.state.seq);
  const line = (type, state, refs) => {
    const last = mineNow().pop(), head = last ? last.hash : me;
    return { type, state: { ...(opts.at !== undefined ? { at: opts.at } : {}), audience: 'public', seq: last ? last.state.seq + 1 : 1, ...state }, refs: { author: me, prev: head, ...refs } };
  };
  // item 7, signs only what its own `read` reads (write_refusals is read, asked of the draft)
  const signs = draft => {
    const why = door('write_refusals', draft, pool);
    if (why.length) return { answer: 'nothing', cannot_sign: why.map(x => x.code), draft };
    if (!sign) return null;
    const b = sign(draft.type, draft.state, draft.refs);
    pool.push(b);
    return b;
  };
  const side = me !== undefined && (first.refs.from === me || first.refs.to === me);
  // item 6, answering: a first promise from the other side, naming it: its accept answers the offer and names it in `for`; it adds no term
  if (S.hash === first.hash && me !== undefined && S.refs.author !== me && side) {
    const q = isObj(S.state.terms) ? S.state.terms.quantity : undefined;
    if (isObj(q) && ('min' in q || 'max' in q)) return { answer: 'nothing', why: 'a range is the taker\'s to choose; its accept adds no term', stage: stageOf().stage };
    const draft = line('promise', { status: 'accepted', ...audience }, { answers: S.hash, for: S.hash });
    const r = signs(draft);
    if (r && r.answer) return r;
    return say(stageOf(), { draft, ...(r ? { signed: r.hash } : {}) });
  }
  // item 7, settling: a payment made to it for the deal, counted as received only when its own tally says so; its `accepted` answer carries `covers`
  if (S.type === 'transfer' && S.refs.to_owner === me && me !== undefined && S.refs.what === undefined && S.state.amount && S.state.status === undefined) {
    if (!received.includes(S.hash)) return { answer: 'nothing', why: 'a payment is counted received only when it counts it', stage: stageOf().stage };
    const draft = line('transfer', { status: 'accepted', covers: S.state.amount, ...audience }, { answers: S.hash, for: first.hash });
    const r = signs(draft);
    if (r && r.answer) return r;
    return say(stageOf(), { draft, ...(r ? { signed: r.hash } : {}) });
  }
  return say(stageOf());
}

module.exports = { dealer, conformsFor, READ_TERMS };
