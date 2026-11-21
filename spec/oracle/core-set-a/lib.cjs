'use strict';
// Stories of CORE-SET 3a and 3b (changes-1.9/CORE-SET.md), one script per entry. Each prints, per question, the oracle's answer and the answer the text gives, and OK or DIFF.
// Signed with Node's own crypto (stage 3's helpers), never the oracle's signer.
const H = require('../stage3-scratch/h.cjs');
const { fb, World, P, T, tg, nm, J, person, A, kindOf, instance, give, accept, offer, accepts, day, headerOf, cj, sha } = H;
let bad = 0, n = 0;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// check(entry, question, oracle's answer, the answer the text gives)
function check(entry, q, got, want) {
  n++; const ok = same(got, want); if (!ok) bad++;
  console.log(`${entry} | ${q}\n    oracle: ${JSON.stringify(got)}\n    text:   ${JSON.stringify(want)}   ${ok ? 'OK' : 'DIFF'}`);
}
const done = () => { console.log(`-- ${n} questions, ${bad} differ`); process.exitCode = bad ? 1 : 0; };
const codes = l => l.map(x => x.code);
// the answer of ownership as a short, readable value
const ownersOf = r => (r === null ? null : r.not_shown ? { not_shown: true, lacks: r.lacks.map(x => (typeof x === 'string' ? tg(x) : x)) } : { owners: r.owners.map(o => [nm(o.owner), o.amount && o.amount.value]).sort((a, b) => (a[0] < b[0] ? -1 : 1)) });
const drawsOf = r => (r && !r.not_shown ? r.draws.map(d => [tg(d.block), d.takes, d.why, d.state]) : null);
module.exports = { ...H, check, done, codes, ownersOf, drawsOf, same };
// a deal in the shape stage 3's stories use: the seller's offer of the thing, the buyer's accept; a draw `for` it with her yes in its past
// 1.9 3c-1: an offer that names an instance holds it, so the stories' sales are the buyer's ORDER (which the text's worlds say: "Amara orders L7"), accepted by the seller; the order holds nothing
const deal = (seller, thing, buyer, qty) => { const o = offer(buyer, seller, buyer, thing, { quantity: qty, price: { value: '1', unit: 'GBP' } }); const a = accepts(seller, o); return { o, a }; };
const sell = (seller, thing, buyer, d, amount, o = {}, extra = {}) => seller.write('transfer', { ...(amount ? { amount } : {}), ...extra }, { what: thing.hash, to_owner: buyer.id, ...(d ? { for: d.o.hash, after: d.a.hash } : {}) }, o);
const own = (w, thing) => fb.door('ownership', thing, w.blocks);
Object.assign(module.exports, { deal, sell, own });
