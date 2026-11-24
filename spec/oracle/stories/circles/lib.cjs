'use strict';
// Stories of circles (circles.md), one script per story. Same helpers as the other stories: each question prints the oracle's answer and the answer the text gives, and OK or DIFF.
// Signed with Node's own crypto, never the oracle's signer. The test world is `cafe()`.
const L = require('../kit.cjs');
const { fb, World, P, T, tg, nm, A, kindOf, instance, day } = L;
const GBP = v => A(String(v), 'GBP');
const part = n => A(String(n), 'part');
const per = (v, thing) => ({ amount: GBP(v), per: A('1', thing) });
const r1 = (extra = {}) => ({ parts: 1, scope: { types: ['promise', 'transfer', 'transform', 'observe', 'thing', 'grant'], parties: 'any', on: 'any', each: GBP(300), ...extra } });
// a circle's founding block, signed by its founder: pack, rules, clocks, meter
function found(founder, { pack, rules, clocks, meter, name = 'circle' } = {}) {
  return founder.write('actor', { kind: 'circle', name, ...(pack !== undefined ? { pack: part(pack) } : {}), ...(rules ? { rules } : {}), ...(clocks ? { clocks } : {}) }, { ...(meter ? { meter } : {}) });
}
// parts move as any amount moves: a transfer to_owner, and the receiver's accepted answer
const sendParts = (from, circle, n, to) => from.write('transfer', { amount: part(n) }, { what: circle.hash, to_owner: to.id });
const yesTo = (to, t) => to.write('transfer', { status: 'accepted' }, { answers: t.hash });
// a block `as` the circle, signed by a person as her own word
const as = (who, circle, type, state, refs = {}) => who.write(type, state, { as: circle.hash, ...refs });
const confirm = (who, m, state = {}, refs = {}) => who.write('observe', { kind: 'confirm', ...state }, { confirms: m.hash, ...refs });
const owners = cs => cs === null ? null : Array.isArray(cs.owners) ? cs.owners.map(o => [nm(o.owner), o.amount.value]).sort((a, b) => (a[0] < b[0] ? -1 : 1)) : cs.owners;
const state = (w, F, within) => fb.door('circle_state', F.hash, w.blocks, within);
const holds = (w, F, b) => fb.door('row_holds', b, w.blocks);
const speaks = (w, b) => fb.door('speaks_for', b, w.blocks);
const waits = (w, b) => fb.door('stands', b, w.blocks);
const ownPart = (w, F) => { const r = fb.door('ownership', F, w.blocks); return r === null ? null : r.not_shown ? { not_shown: true } : { owners: r.owners.map(o => [nm(o.owner), o.amount && o.amount.value]).sort((a, b) => (a[0] < b[0] ? -1 : 1)), held: r.held && r.held.value, draws: r.draws.map(d => [tg(d.block), d.takes, d.why, d.state]) }; };
const readCodes = (b, w) => { try { return fb.readFindings(b, w.blocks).map(x => x.code); } catch (e) { return 'error: ' + e.message; } };
const handsOf = r => r.hands.map(h => [nm(h.id), h.parts && h.parts.value, h.counts, h.why]);
// the test café: Amara founds F (pack 100, clocks [N], meter T, row r1); P1 (50 part to Leila), P2 (Leila's yes)
function cafe(o = {}) {
  const w = new World();
  const amara = P(w, 'amara'), leila = P(w, 'leila'), harry = P(w, 'harry'), ben = P(w, 'ben'), joe = P(w, 'joe'), maria = P(w, 'maria'), rex = P(w, 'rex'), wan = P(w, 'wanjiru'), till = P(w, 'till');
  const N = wan.id, Tm = till.id;
  const F = T(found(amara, { pack: 100, rules: o.rulesFn ? o.rulesFn({ harry: harry.id }) : o.rules || [r1()], clocks: o.clocks === null ? undefined : { names: [N] }, meter: o.meter === null ? undefined : Tm, name: 'cafe' }), 'F');
  const out = { w, amara, leila, harry, ben, joe, maria, rex, wan, till, F, N, Tm };
  if (!o.noparts) { out.P1 = T(sendParts(amara, F, 50, leila), 'P1'); out.P2 = T(yesTo(leila, out.P1), 'P2'); }
  return out;
}
// the café with a staff grant that can deal: r1, and G under it naming Amara's want A1 in `on` and Harry in `parties` (r1 says `any` at both, so a grant under it may name them)
function staffWorld(o = {}) {
  const w = new World(), amara = P(w, 'amara'), leila = P(w, 'leila'), harry = P(w, 'harry'), joe = P(w, 'joe'), till = P(w, 'till'), wan = P(w, 'wanjiru');
  const milk = kindOf(amara, 'milk');
  const A1 = T(amara.write('promise', { terms: { lines: [{ id: 'milk', what: milk.hash, quantity: A('10', 'litre'), price: { max: per(1.5, 'litre') } }], pay_by: { min: 'P3D' }, deliver_by: day(5, 12) } }, { to: amara.id }), 'A1');
  const clocksOn = o.clocked ? { clocks: { names: [wan.id], needed: 1 } } : {};
  const F = T(found(amara, { pack: 100, rules: [r1()], clocks: { names: [wan.id] }, meter: till.id, name: 'cafe' }), 'F');
  const P1 = T(sendParts(amara, F, 50, leila), 'P1'); T(yesTo(leila, P1), 'P2');
  const G = T(as(amara, F, 'grant', { kind: 'tool', scope: { types: ['promise', 'transfer'], on: [A1.hash], parties: [harry.id], each: GBP(100), limit: GBP(250), ...clocksOn } }, { to: joe.id, meter: till.id }), 'G');
  const offer = tag => { const inst = instance(harry, milk, { pack: A('10', 'litre') }); return T(harry.write('promise', { terms: { lines: [{ id: 'milk', what: inst.hash, quantity: A('10', 'litre'), price: per(1.2, 'litre') }], pay_by: 'P4D', deliver_by: day(5, 12) } }, { from: harry.id, to: amara.id }), tag); };
  const order = (H, tag, refs = {}) => { const j = T(joe.write('promise', { status: 'accepted', draws: { grant: G.hash, amount: GBP(12) } }, { answers: H.hash, for: H.hash, under: G.hash, ...refs }), tag); till.write('observe', { kind: 'receipt' }, { derives_from: [j.hash] }); return j; };
  return { w, amara, leila, harry, joe, till, wan, F, G, A1, offer, order };
}
module.exports = { ...L, staffWorld, GBP, part, per, r1, found, sendParts, yesTo, as, confirm, owners, state, holds, speaks, waits, ownPart, readCodes, handsOf, cafe };
