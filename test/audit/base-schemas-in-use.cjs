// Case 11: the base schemas in use (spec/schemas). The publisher's chain is given; a closed block names a schema and carries what it
// declares; every use below is computed by the folds the core and the oracle already share, so nothing here is a new engine rule.
const fs = require('fs')
const { fb, World, kindOf } = require('./lib.cjs')
const P = require('../../spec/schemas/published.json')
const GBP = (value) => ({ value, unit: 'GBP' })
const w = new World('case11 base schemas')
w.useSchemas = true
// The publisher's chain is given first, as a node holds the schemas it has seen.
w.blocks.push(P.genesis)
for (const name of P.order) w.blocks.push(P.schemas[name])
const S = (name) => P.schemas[name].hash
w.baseSchemas = Object.fromEntries(P.order.map((n) => [n, S(n)]))

const ann = w.person('ann'), mo = w.person('mo'), nan = w.person('nan'), cook = w.person('cook'), buyer = w.person('buyer'), teacher = w.person('teacher'), learner = w.person('learner')
const gran = w.person('gran'), heir = w.person('heir')

// ---- shareholding: circles. Acme's 5 parts are its shares; Ann hands Mo 2 and Nan 1 (a transfer and the receiver's yes). The
// A count by share is a parts row, so no vote is written here.
const acme = w.w(ann, 'actor', { kind: 'circle', name: 'Acme', pack: { value: '5', unit: 'part' }, rules: [{ parts: 1, scope: { parties: 'any', on: 'any', types: ['promise', 'transfer', 'observe', 'thing', 'grant'] } }] }, {}, 'circle Acme')
const give = (n, to, note) => { const t = w.w(ann, 'transfer', { amount: { value: String(n), unit: 'part' } }, { what: acme.hash, to_owner: to.id }, note); w.w(to, 'transfer', { status: 'accepted' }, { answers: t.hash }, note + ' accepted') }
give(2, mo, '2 parts to mo'); give(1, nan, '1 part to nan')

// ---- the facts of each promise the cook gave: its stage and who ended it (no verdict) ----
const offer = (n, note) => w.w(cook, 'promise', { what: 'loaf ' + n, terms: { lines: [{ id: 'loaf', what: loaf(n).hash }], expires: '2027-06-01T00:00:00.000Z' } }, { from: cook.id, to: buyer.id }, note)
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
const k7 = w.w(cook, 'promise', { what: 'a loaf every Friday', when: '2026-10-23T08:00:00.000Z', terms: { lines: [{ id: 'loaf', what: loaf(7).hash }], repeat: 'FREQ=WEEKLY;BYDAY=FR', zone: 'UTC', expires: '2027-06-01T00:00:00.000Z' } }, { from: cook.id, to: buyer.id }, 'cook weekly promise 7')
accept(k7, 'accept 7'); w.w(cook, 'promise', { status: 'stopped', stop: 'onward' }, { updates: k7.hash }, 'cook ends the weekly 7')
// promises not to do something (no refs.what, `state.what` says what its signer will not do, `terms.until` until when): disputed by the side they were made to, left alone by the promiser, released by the other side
const refrain = (n, note) => w.w(cook, 'promise', { what: 'no rival bread ' + n, terms: { until: '2027-12-31T00:00:00.000Z', expires: '2027-06-01T00:00:00.000Z' } }, { from: cook.id, to: buyer.id }, note)
const k8 = refrain(8, 'cook refrain 8'); const a8 = accept(k8, 'accept 8')
w.w(buyer, 'observe', { kind: 'report', text: 'rival bread on the shelf', when: '2027-03-01T00:00:00.000Z' }, { defeats: k8.hash, for: k8.hash, after: [a8.hash] }, 'buyer shows 8 was broken')
const k9 = refrain(9, 'cook refrain 9'); accept(k9, 'accept 9'); w.w(cook, 'promise', { status: 'stopped', stop: 'onward' }, { updates: k9.hash }, 'cook leaves refrain 9 alone, early')
const k10 = refrain(10, 'cook refrain 10'); const a10 = accept(k10, 'accept 10'); w.w(buyer, 'promise', { status: 'stopped', stop: 'onward' }, { answers: k10.hash, for: k10.hash, after: [a10.hash] }, 'buyer lets refrain 10 go')
// a promise to yourself is never counted
const k11 = w.w(cook, 'promise', { what: 'bake one for me', terms: { lines: [{ id: 'loaf', what: loaf(11).hash }], expires: '2027-06-01T00:00:00.000Z' } }, { from: cook.id, to: cook.id }, 'cook plan 11')
// a promise not to do whose promiser's list closed: a close ends authority, never a promise. There is no successor;
// her will is her own transfer on `{ closed: <her id> }`, and her close is a key grant that leaves no voice of her list.
const k12 = w.w(gran, 'promise', { what: 'no rival jam', terms: { until: '2027-12-31T00:00:00.000Z', expires: '2027-06-01T00:00:00.000Z' } }, { from: gran.id, to: buyer.id }, 'gran refrain 12')
const a12 = accept(k12, 'accept 12')
const jam = w.w(gran, 'thing', { kind: 'jam pan', name: 'gran\'s jam pan' }, { of: kindOf('jam pan') }, 'gran\'s jam pan')
const will = w.w(gran, 'transfer', { condition: { closed: gran.id } }, { what: jam.hash, to_owner: heir.id }, 'gran wills her jam pan to her heir')
w.w(heir, 'transfer', { status: 'accepted' }, { answers: will.hash }, 'the heir accepts the will')
const close = w.w(gran, 'grant', { kind: 'key', voices: [] }, { subject: gran.id, updates: gran.id, after: [a12.hash] }, 'gran closes her list')
w.will = { jam: jam.hash, will: will.hash, close: close.hash, gran: gran.id, heir: heir.id }
w.promises = [k1, k2, k3, k4, k5, k6, k7, k8, k9, k10, k11, k12].map((p) => p.hash)

// ---- person-confirmed: "delivered by Friday", the receiver confirms by accepting the transfer ----
const box = (n) => {
  const thing = w.w(cook, 'thing', { kind: 'veg box', name: 'box ' + n }, { of: kindOf('veg box') }, 'veg box ' + n)
  const promise = w.w(cook, 'promise', { what: 'a veg box by Friday', terms: { lines: [{ id: 'box', what: thing.hash }], deliver_by: '2026-10-23T17:00:00.000Z', expires: '2026-10-20T00:00:00.000Z' } }, { from: cook.id, to: buyer.id, schema: S('person_confirmed') }, 'veg box promise ' + n + ' (person_confirmed)')
  accept(promise, 'accept veg box ' + n)
  const sent = w.w(cook, 'transfer', {}, { what: thing.hash, to_owner: buyer.id, for: promise.hash }, 'veg box ' + n + ' sent')
  return { promise, sent }
}
const box1 = box(1), box2 = box(2)
w.w(buyer, 'transfer', { status: 'accepted' }, { answers: box1.sent.hash, for: box1.promise.hash }, 'the receiver confirms box 1 arrived')
w.personConfirmed = { confirmed: box1.promise.hash, unconfirmed: box2.promise.hash }

// ---- teach: a promise to teach; the learner's accepted answer to the lesson confirms; the make names the teacher's recipe ----
const recipe = w.w(teacher, 'thing', { kind: 'recipe', name: 'sourdough' }, {}, 'teacher recipe')
const teach = w.w(teacher, 'promise', { what: 'teach sourdough, 2 hours', terms: { lines: [{ id: 'lesson', quantity: { value: '2', unit: 'h' } }], expires: '2027-01-01T00:00:00.000Z' } }, { from: teacher.id, to: learner.id, derives_from: recipe.hash, schema: S('teach') }, 'teach promise')
w.w(learner, 'promise', { status: 'accepted' }, { answers: teach.hash, for: teach.hash }, 'learner accepts the lesson')
const lesson = w.w(teacher, 'observe', { kind: 'work', text: 'taught 2h', amount: { value: '2', unit: 'h' } }, { for: teach.hash, schema: S('work') }, 'lesson (work)')
w.w(learner, 'observe', { status: 'accepted' }, { answers: lesson.hash, for: teach.hash }, 'learner confirms the lesson')
// a recipe is cited, never consumed (things.md, A make): the make names it and draws nothing; a lineage share is a promise, never an input
w.w(learner, 'transform', { kind: 'adapt' }, { derives_from: recipe.hash, schema: S('make') }, 'learner adapts the recipe (cited)')
w.teach = teach.hash

// ---- loan and payout as records of work ----
const loan = w.w(ann, 'promise', { terms: { lines: [{ id: 'loan', quantity: GBP('100'), price: GBP('110') }], expires: '2026-12-31T00:00:00.000Z' } }, { from: ann.id, to: mo.id, schema: S('loan') }, 'loan offer (price = the repayment)')
w.w(mo, 'promise', { status: 'accepted' }, { answers: loan.hash, for: loan.hash }, 'mo accepts the loan')
const lent = w.w(ann, 'transfer', { amount: GBP('100') }, { to_owner: mo.id, for: loan.hash }, 'ann lends 100'); w.w(mo, 'transfer', { status: 'accepted' }, { answers: lent.hash, for: loan.hash }, 'mo takes it')
const back = w.w(mo, 'transfer', { amount: GBP('110') }, { to_owner: ann.id, for: loan.hash }, 'mo repays 110'); w.w(ann, 'transfer', { status: 'accepted' }, { answers: back.hash, for: loan.hash }, 'ann takes it')
const advance = w.w(ann, 'observe', { kind: 'work', amount: GBP('100'), text: 'advanced 100 GBP' }, { for: loan.hash, derives_from: lent.hash, schema: S('payout') }, 'the advance, as a payout record')
w.w(mo, 'observe', { status: 'accepted' }, { answers: advance.hash, for: loan.hash }, 'mo accepts the advance record')
w.loan = loan.hash
w.report()
module.exports = { w, ann, mo, nan, acme }
