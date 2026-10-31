// Case 11: the base schemas in use (spec/schemas). The publisher's chain is held; a closed block names a schema and carries what it
// declares; every use below is computed by the folds the core and the oracle already share, so nothing here is a new engine rule.
const fs = require('fs')
const { fb, World, kindOf } = require('./lib.cjs')
const P = require('../../spec/schemas/published.json')
const GBP = (minor) => ({ minor, currency: 'GBP' })
const w = new World('case11 base schemas')
w.useSchemas = true
// The publisher's chain is held first, as a node holds the schemas it has seen.
w.blocks.push(P.genesis)
for (const name of P.order) w.blocks.push(P.schemas[name])
const S = (name) => P.schemas[name].hash
w.baseSchemas = Object.fromEntries(P.order.map((n) => [n, S(n)]))

const ann = w.person('ann'), mo = w.person('mo'), nan = w.person('nan'), cook = w.person('cook'), buyer = w.person('buyer'), teacher = w.person('teacher'), learner = w.person('learner')
const gran = w.person('gran'), heir = w.person('heir'), doc = w.person('doc')

// ---- shareholding: holding shares of a kind is a vote under a ballots rule (the share_vote schema) ----
const acme = w.w(ann, 'actor', { kind: 'circle', removal: { needed: 1 }, name: 'Acme', roles: [{ name: 'owner', powers: ['sign', 'admit', 'remove'] }] }, {}, 'circle Acme')
const shareKind = w.w(ann, 'thing', { kind: 'share', name: 'Acme share' }, { as: acme.hash }, 'share kind (made as Acme)')
const shares = [0, 1, 2, 3, 4].map((i) => w.w(ann, 'thing', { kind: 'share', lot: 'S' + i }, { of: shareKind.hash, as: acme.hash }, 'share ' + i))
const give = (share, to, note) => { const t = w.w(ann, 'transfer', {}, { what: share.hash, to_owner: to.id, as: acme.hash }, note); w.w(to, 'transfer', { status: 'accepted' }, { answers: t.hash }, note + ' accepted') }
give(shares[0], mo, 'S0 to mo'); give(shares[1], mo, 'S1 to mo'); give(shares[2], nan, 'S2 to nan')
const vote = (p, note) => w.w(p, 'observe', { kind: 'vote', choice: 'f'.repeat(64) }, { of: shareKind.hash, schema: S('share_vote') }, note)
vote(mo, 'mo votes'); vote(nan, 'nan votes'); vote(ann, 'ann votes (owns none)')

// ---- the facts of each promise the cook gave: its stage and who ended it (no verdict: batch 2 P3 deleted the kept_and_broken schema) ----
const offer = (n, note) => w.w(cook, 'promise', { what: 'loaf ' + n, terms: { expires: '2027-06-01T00:00:00.000Z' } }, { from: cook.id, to: buyer.id, what: loaf(n).hash }, note)
const loaf = (n) => w.w(cook, 'thing', { kind: 'loaf', name: 'loaf ' + n }, { of: kindOf('loaf') }, 'loaf ' + n)
const accept = (p, note) => w.w(buyer, 'promise', { status: 'accepted' }, { answers: p.hash, for: p.hash }, note)
const deliver = (p, thing, note) => { const t = w.w(cook, 'transfer', {}, { what: thing.hash, to_owner: buyer.id, for: p.hash }, note); w.w(buyer, 'transfer', { status: 'accepted' }, { answers: t.hash, for: p.hash }, note + ' accepted'); return t }
const k1 = offer(1, 'cook promise 1'); accept(k1, 'accept 1'); deliver(k1, w.blocks.find((b) => b.type === 'thing' && b.state.name === 'loaf 1'), 'deliver 1')
const k2 = offer(2, 'cook promise 2'); accept(k2, 'accept 2'); w.w(cook, 'promise', { status: 'stopped', stop: 'onward' }, { updates: k2.hash }, 'cook stops 2 after the accept')
const k3 = offer(3, 'cook promise 3'); w.w(buyer, 'promise', { status: 'declined' }, { answers: k3.hash, for: k3.hash }, 'buyer declines 3')
const k4 = offer(4, 'cook promise 4'); accept(k4, 'accept 4')
const k5 = offer(5, 'cook promise 5'); const a5 = accept(k5, 'accept 5'); w.w(buyer, 'promise', { status: 'stopped', stop: 'onward' }, { answers: k5.hash, for: k5.hash, after: [a5.hash] }, 'buyer lets 5 go')
const k6 = offer(6, 'cook promise 6'); accept(k6, 'accept 6'); const s6 = w.w(cook, 'promise', { status: 'stopped', stop: 'onward' }, { updates: k6.hash }, 'cook stops 6')
w.w(buyer, 'observe', { kind: 'agree', text: 'fine' }, { confirms: s6.hash, for: k6.hash }, 'buyer agrees to the stop of 6')
const k7 = w.w(cook, 'promise', { what: 'a loaf every Friday', when: '2026-10-23T08:00:00.000Z', terms: { repeat: 'FREQ=WEEKLY;BYDAY=FR', zone: 'UTC', expires: '2027-06-01T00:00:00.000Z' } }, { from: cook.id, to: buyer.id, what: loaf(7).hash }, 'cook weekly promise 7')
accept(k7, 'accept 7'); w.w(cook, 'promise', { status: 'stopped', stop: 'onward' }, { updates: k7.hash }, 'cook ends the weekly 7')
// promises not to do something (refrains): disputed by the side they were made to (batch 2 P4), left alone by the promiser, released by the other side
const refrain = (n, note) => w.w(cook, 'promise', { what: 'no rival bread ' + n, terms: { refrain: true, until: '2027-12-31T00:00:00.000Z', expires: '2027-06-01T00:00:00.000Z' } }, { from: cook.id, to: buyer.id, what: loaf(n).hash }, note)
const k8 = refrain(8, 'cook refrain 8'); const a8 = accept(k8, 'accept 8')
w.w(buyer, 'observe', { kind: 'report', text: 'rival bread on the shelf', when: '2027-03-01T00:00:00.000Z' }, { defeats: k8.hash, for: k8.hash, after: [a8.hash] }, 'buyer shows 8 was broken')
const k9 = refrain(9, 'cook refrain 9'); accept(k9, 'accept 9'); w.w(cook, 'promise', { status: 'stopped', stop: 'onward' }, { updates: k9.hash }, 'cook leaves refrain 9 alone, early')
const k10 = refrain(10, 'cook refrain 10'); const a10 = accept(k10, 'accept 10'); w.w(buyer, 'promise', { status: 'stopped', stop: 'onward' }, { answers: k10.hash, for: k10.hash, after: [a10.hash] }, 'buyer lets refrain 10 go')
// a promise to yourself is never counted
const k11 = w.w(cook, 'promise', { what: 'bake one for me', terms: { expires: '2027-06-01T00:00:00.000Z' } }, { from: cook.id, to: cook.id, what: loaf(11).hash }, 'cook promise to self 11')
// a refrain whose promiser died: a death ends authority, never a promise (batch 2 P7)
const k12 = w.w(gran, 'promise', { what: 'no rival jam', terms: { refrain: true, until: '2027-12-31T00:00:00.000Z', expires: '2027-06-01T00:00:00.000Z' } }, { from: gran.id, to: buyer.id, what: loaf(12).hash }, 'gran refrain 12')
accept(k12, 'accept 12')
const heirGrant = w.w(gran, 'grant', { kind: 'successor', witnesses: [doc.id], needed: 1, wait: 'P7D' }, { to: heir.id }, 'gran names her heir')
const sign = w.w(doc, 'observe', { kind: 'trigger' }, { under: heirGrant.hash, subject: gran.id }, 'the doctor records her death')
w.w(heir, 'observe', { kind: 'close' }, { under: heirGrant.hash, subject: gran.id, after: [sign.hash] }, 'the heir closes her chain')
w.promises = [k1, k2, k3, k4, k5, k6, k7, k8, k9, k10, k11, k12].map((p) => p.hash)

// ---- person-confirmed: "delivered by Friday", the receiver confirms by accepting the transfer ----
const box = (n) => {
  const thing = w.w(cook, 'thing', { kind: 'veg box', name: 'box ' + n }, { of: kindOf('veg box') }, 'veg box ' + n)
  const promise = w.w(cook, 'promise', { what: 'a veg box by Friday', terms: { deliver_by: '2026-10-23T17:00:00.000Z', expires: '2026-10-20T00:00:00.000Z' } }, { from: cook.id, to: buyer.id, what: thing.hash, schema: S('person_confirmed') }, 'veg box promise ' + n + ' (person_confirmed)')
  accept(promise, 'accept veg box ' + n)
  const sent = w.w(cook, 'transfer', {}, { what: thing.hash, to_owner: buyer.id, for: promise.hash }, 'veg box ' + n + ' sent')
  return { promise, sent }
}
const box1 = box(1), box2 = box(2)
w.w(buyer, 'transfer', { status: 'accepted' }, { answers: box1.sent.hash, for: box1.promise.hash }, 'the receiver confirms box 1 arrived')
w.personConfirmed = { confirmed: box1.promise.hash, unconfirmed: box2.promise.hash }

// ---- teach: a promise to teach; the learner's accepted answer to the lesson confirms; the make names the teacher's recipe ----
const recipe = w.w(teacher, 'thing', { kind: 'recipe', name: 'sourdough' }, {}, 'teacher recipe')
const teach = w.w(teacher, 'promise', { what: 'teach sourdough, 2 hours', terms: { quantity: { value: '2', unit: 'h' }, expires: '2027-01-01T00:00:00.000Z' } }, { from: teacher.id, to: learner.id, derives_from: recipe.hash, schema: S('teach') }, 'teach promise')
w.w(learner, 'promise', { status: 'accepted' }, { answers: teach.hash, for: teach.hash }, 'learner accepts the lesson')
const lesson = w.w(teacher, 'observe', { kind: 'work', text: 'taught 2h', amount: { value: '2', unit: 'h' } }, { for: teach.hash, schema: S('work') }, 'lesson (work)')
w.w(learner, 'observe', { status: 'accepted' }, { answers: lesson.hash, for: teach.hash }, 'learner confirms the lesson')
w.w(learner, 'transform', { kind: 'adapt', shares: [{ from: recipe.hash, share: '0.05' }] }, { derives_from: recipe.hash, schema: S('make') }, 'learner adapts the recipe, 5% to the teacher')
w.teach = teach.hash

// ---- loan and payout as records of work ----
const loan = w.w(ann, 'promise', { what: 'loan of 100 GBP, repay 110', principal: GBP(10000), terms: { price: GBP(11000), expires: '2026-12-31T00:00:00.000Z' } }, { from: ann.id, to: mo.id, schema: S('loan') }, 'loan offer (price = the repayment)')
w.w(mo, 'promise', { status: 'accepted' }, { answers: loan.hash, for: loan.hash }, 'mo accepts the loan')
const lent = w.w(ann, 'transfer', { money: GBP(10000) }, { to_owner: mo.id, for: loan.hash }, 'ann lends 100'); w.w(mo, 'transfer', { status: 'accepted' }, { answers: lent.hash, for: loan.hash }, 'mo takes it')
const back = w.w(mo, 'transfer', { money: GBP(11000) }, { to_owner: ann.id, for: loan.hash }, 'mo repays 110'); w.w(ann, 'transfer', { status: 'accepted' }, { answers: back.hash, for: loan.hash }, 'ann takes it')
const advance = w.w(ann, 'observe', { kind: 'work', amount: GBP(10000), text: 'advanced 100 GBP' }, { for: loan.hash, derives_from: lent.hash, schema: S('payout') }, 'the advance, as a payout record')
w.w(mo, 'observe', { status: 'accepted' }, { answers: advance.hash, for: loan.hash }, 'mo accepts the advance record')
w.loan = loan.hash
w.report()
module.exports = { w, ann, mo, nan, shareKind, shares }
