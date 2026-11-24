'use strict';
// Stories of grants, one script per rule or group. Same helpers as every story (kit.cjs): each question prints the oracle's answer and
// the answer the text gives, and OK or DIFF. Signed with Node's own crypto (the circles helpers), never the oracle's signer.
const L = require('../kit.cjs');
const { fb, World, P, T, A, kindOf, instance, day } = L;
const GBP = v => A(String(v), 'GBP');
// a price per unit, a plain price, ends
const per = (v, unit, thing) => ({ amount: GBP(v), per: A('1', thing) });
// a block's reason for not being under its grant: the first code, or null when it is
const why = (b, w) => { const r = fb.whyNotUnder(b, w.blocks); return r.length ? r[0].code : null; };
const ok = (b, w) => fb.door('under_ok', b, w.blocks);
const backedBy = (b, person, w) => fb.door('backed', b, person.id, w.blocks);
const meter = (g, w, at) => fb.door('meter', g, w.blocks, at);
const worst = (g, w) => fb.door('worst_case', g, w.blocks);
// a person's grant to a tool; scope fields as the text writes them, refs.meter and the rest as refs
function grant(giver, to, scope, refs = {}, state = {}) {
  return giver.write('grant', { kind: 'tool', scope, ...state }, { ...(to ? { to: to.id } : {}), ...refs });
}
// a tool's block under its grant: draws states what it draws
const under = (tool, g, type, state, refs = {}, draws) => tool.write(type, { ...(draws ? { draws: { grant: g.hash, amount: draws } } : {}), ...state }, { under: g.hash, ...refs });
// a promise (a want, an offer): from, to, what, terms
const promise = (s, refs, terms, state = {}, more = {}) => s.write('promise', { terms, ...state }, { ...refs, ...more });
// a receipt by a clock or meter: observe kind receipt, derives_from the blocks it names, with the running totals it states
const receipt = (clock, blocks, drawn, state = {}) => clock.write('observe', { kind: 'receipt', ...(drawn ? { drawn } : {}), ...state }, { derives_from: [].concat(blocks).map(b => b.hash) });
module.exports = { ...L, GBP, per, why, ok, backedBy, meter, worst, grant, under, promise, receipt };

// ---- the base world W (blocks numbered in the order signed). Options: meter 'n0' (Wanjiru's clock) or 'own' (the AI's own line); limit (default £210).
// (1) Amara A0 genesis. (2) Wanjiru N0, a clock's genesis (and FoodX F0, the other clock). (3) Amara A1, want W: kind flour F, 10 sacks, price { max: £21 per sack }, pay_by { min: P3D }, deliver_by Friday 12:00.
// (4) Amara A2, grant G to her AI's key I: types [promise, observe, transfer], on [A1], parties [Harry, Sam, Mill Lane], limit £210, refs.meter N0, clocks { names: [FoodX F0, N0], needed: 2 }.
function baseWorld(o = {}) {
  const w = new World();
  const amara = P(w, 'amara'), n0 = P(w, 'wanjiru'), f0 = P(w, 'foodx'), harry = P(w, 'harry'), sam = P(w, 'sam'), mill = P(w, 'milllane'), ravi = P(w, 'ravi'), ai = P(w, 'amara-ai');
  const F = kindOf(amara, 'flour');
  const friday = day(5, 12);
  const wantTerms = { lines: [{ id: 'flour', what: F.hash, quantity: A('10', 'sack'), price: { max: per(21, 'GBP', 'sack') } }], pay_by: { min: 'P3D' }, deliver_by: friday };
  const A1 = T(promise(amara, { to: amara.id }, wantTerms), 'A1');
  const meterId = o.meter === 'own' ? ai.id : n0.id;
  const clocks = { names: [f0.id, n0.id].sort(), needed: 2 };
  const scope = { types: ['promise', 'observe', 'transfer'], on: [A1.hash], parties: [harry.id, sam.id, mill.id].sort(), limit: GBP(o.limit === undefined ? 210 : o.limit), clocks, ...(o.scope || {}) };
  const G = T(grant(amara, ai, scope, { meter: meterId, ...(o.refs || {}) }, o.state || {}), 'G');
  const W = { w, amara, n0, f0, harry, sam, mill, ravi, ai, F, A1, G, friday, clocks, meterId, totals: new Map() };
  // an offer of 10 sacks of flour from a seller to Amara at a price per sack, pay_by a duration
  W.offer = (seller, price, extra = {}, tag) => {
    const inst = instance(seller, F, { pack: A('10', 'sack') });
    const terms = Object.fromEntries(Object.entries({ quantity: A('10', 'sack'), price: per(price, 'GBP', 'sack'), pay_by: 'P4D', deliver_by: friday, ...(extra.terms || {}) }).filter(([, v]) => v !== undefined));
    return T(promise(seller, { from: seller.id, to: amara.id, ...(extra.refs || {}) }, L.linesFor(inst, terms, 'flour'), extra.state || {}), tag);
  };
  // the AI's accept of an offer under G, stating what it draws
  W.accept = (offer, amount, tag, grantB = G, tool = ai, extra = {}) => T(tool.write('promise', { status: 'accepted', draws: { grant: grantB.hash, amount: GBP(amount) }, ...(extra.state || {}) }, { answers: offer.hash, for: offer.hash, under: grantB.hash, ...(extra.refs || {}) }), tag);
  // the meter's receipt of a block, with the running total it states for a grant
  W.receipt = (blocks, amount, tag, grantB = G, clock = n0) => {
    const key = clock.id + grantB.hash, before = W.totals.get(key) || 0, total = before + Number(amount);
    W.totals.set(key, total);
    return T(receipt(clock, blocks, [{ of: grantB.hash, amount: GBP(amount), total: GBP(total) }]), tag);
  };
  return W;
}
module.exports.baseWorld = baseWorld;
// the first failing reason of a block under a grant: its code and the path that differed (Keeps to)
const whyOf = (b, w) => { const r = fb.whyNotUnder(b, w.blocks); return r.length ? { code: r[0].code, why: r[0].why || null } : null; };
const wf = (b, w) => fb.writeFindings({ type: b.type, state: b.state, refs: b.refs }, w.blocks).map(x => x.code);
Object.assign(module.exports, { whyOf, wf });
