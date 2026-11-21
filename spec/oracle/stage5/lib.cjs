'use strict';
// Stories of stage 5 (changes-1.9/05-deals.md), one script per story. Same helpers as core-set-a/-b and stage 4: each question prints the oracle's answer and the answer the text gives, and OK or DIFF.
// Signed with Node's own crypto (stage 3's helpers), never the oracle's signer.
const L = require('../core-set-b/lib.cjs');
const { fb, A, kindOf, instance, day } = L;
const GBP = v => A(String(v), 'GBP');
const stage = (w, first, o = {}) => fb.door('promise_stage', first, w.blocks, o);
const view = (w, first, now) => fb.door('promise_view', first, w.blocks, { now });
const am = a => (a ? a.value + ' ' + a.unit : null);
// requests as [[tag, open]]
const reqs = (st, tg) => (st.requests || []).map(r => [tg(r.block), r.open]);
// an answer to a first promise: accepted, with the deal named
const yes = (s, deal, o = {}, state = {}, refs = {}) => s.write('promise', { status: 'accepted', ...state }, { answers: (o.answers || deal).hash, for: deal.hash, ...refs }, o.at ? { at: o.at } : {});
const no = (s, deal, o = {}, state = {}, refs = {}) => s.write('promise', { status: 'declined', ...state }, { answers: (o.answers || deal).hash, for: deal.hash, ...refs });
const stop = (s, target, kind = 'onward', state = {}, refs = {}) => s.write('promise', { status: 'stopped', stop: kind, ...state }, { updates: target.hash, ...refs });
const own = L.own;
const owners = r => L.ownersOf(r);
const draws = (r, tg) => L.drawsOf(r);
module.exports = { ...L, GBP, stage, view, am, reqs, yes, no, stop };
