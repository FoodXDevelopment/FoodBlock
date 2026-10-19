// Several takers on one open offer: each allocation is a deal of its own (promises.md), so one taker's goods and payment never
// count toward another's quantity.
const { fb, oracle, World } = require('./lib.cjs')
const GBP = (m) => ({ minor: m, currency: 'GBP' })
const show = (n, ...a) => console.log('>>', n, ...a.map(x => typeof x === 'string' ? x : JSON.stringify(x)))
const w = new World('case4b multi-taker settlement')
const maya = w.person('maya'), t1 = w.person('t1'), t2 = w.person('t2')
const eggs = w.w(maya, 'thing', { kind: 'eggs' }, {}, 'eggs')
const O = w.w(maya, 'promise', { terms: { price: { money: GBP(300), per: { value: '1', unit: 'egg' } }, quantity: { value: '100', unit: 'egg' }, expires: '2027-01-01T00:00:00.000Z' } }, { from: maya.id, what: eggs.hash }, 'open offer')
const req = (t, q) => w.w(t, 'promise', { status: 'accepted', terms: { quantity: { value: String(q), unit: 'egg' } } }, { answers: O.hash, for: O.hash }, t.label + ' req ' + q)
const alloc = (r, q, label) => w.w(maya, 'promise', { status: 'accepted', terms: { quantity: { value: String(q), unit: 'egg' } } }, { answers: r.hash, for: O.hash }, label)
const r1 = req(t1, 2), r2 = req(t2, 1)
const a1 = alloc(r1, 2, 'allocation t1'), a2 = alloc(r2, 1, 'allocation t2')
// t2 pays 3.00 and gets 1 egg for his own allocation; t1 (2 eggs) has paid nothing and got nothing.
const i2 = w.w(maya, 'thing', { kind: 'eggs', lot: 'X', pack: { value: '1', unit: 'egg' } }, { of: eggs.hash }, 'instance for t2')
const tr = w.w(maya, 'transfer', {}, { what: i2.hash, to_owner: t2.id, for: a2.hash }, 'deliver 1 egg to t2'); w.w(t2, 'transfer', { status: 'accepted' }, { answers: tr.hash, for: a2.hash }, 't2 accepts the egg')
const p = w.w(t2, 'transfer', { money: GBP(300) }, { to_owner: maya.id, for: a2.hash }, 't2 pays 3.00'); w.w(maya, 'transfer', { status: 'accepted' }, { answers: p.hash, for: a2.hash }, 'maya accepts the payment')
// a payment named for the open offer itself counts toward no one
const stray = w.w(t1, 'transfer', { money: GBP(600) }, { to_owner: maya.id, for: O.hash }, 't1 pays 6.00 naming the offer'); w.w(maya, 'transfer', { status: 'accepted' }, { answers: stray.hash, for: O.hash }, 'maya accepts that payment')
show('t2 allocation', fb.promiseStage(a2, w.blocks).stage, 't1 allocation', fb.promiseStage(a1, w.blocks).stage, 'open offer', fb.promiseStage(O, w.blocks).stage)
w.report()
