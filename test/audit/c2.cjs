const { fb, oracle, World, kindOf } = require('./lib.cjs')
const w = new World('case2 lending')
const pat = w.person('pat'), lena = w.person('lena'), bo = w.person('bo'), cy = w.person('cy')
const show = (n, ...a) => console.log('>>', n, ...a.map(x => typeof x === 'string' ? x : JSON.stringify(x)))
const cmpStage = (label, first) => {
  const s = fb.promiseStage(first, w.blocks), o = oracle.door('promise_stage', first, w.blocks)
  if (s.stage !== o.stage) w.problems.push(`stage differs ${label}: sdk=${s.stage} oracle=${o.stage}`)
  return s
}
const eggs = w.w(pat, 'thing', { kind: 'eggs' }, {}, 'eggs kind')
const GBP = (m) => ({ minor: m, currency: 'GBP' })
const mkDeal = (label, deliverBy) => {
  const o = w.w(pat, 'promise', { terms: { price: GBP(500), quantity: { value: '1', unit: 'tray' }, deliver_by: deliverBy, expires: '2027-01-01T00:00:00.000Z' } }, { from: pat.id, to: lena.id, what: eggs.hash }, label + ' offer')
  const a = w.w(lena, 'promise', { status: 'accepted' }, { answers: o.hash, for: o.hash }, label + ' accept')
  return o
}
const inst = (label) => w.w(pat, 'thing', { kind: 'eggs', lot: label, pack: { value: '1', unit: 'tray' } }, { of: eggs.hash }, 'instance ' + label)
// 1 kept
const d1 = mkDeal('d1 kept', '2026-10-05T00:00:00.000Z')
const i1 = inst('L1')
const t1 = w.w(pat, 'transfer', {}, { what: i1.hash, to_owner: lena.id, for: d1.hash }, 'd1 deliver'); w.w(lena, 'transfer', { status: 'accepted' }, { answers: t1.hash, for: d1.hash }, 'd1 accepted')
const p1 = w.w(lena, 'transfer', { money: GBP(500) }, { to_owner: pat.id, for: d1.hash }, 'd1 paid'); w.w(pat, 'transfer', { status: 'accepted' }, { answers: p1.hash, for: d1.hash }, 'd1 payment accepted')
// 2 broken (accepted, past deliver_by, nothing delivered)
const d2 = mkDeal('d2 broken', '2026-10-05T00:00:00.000Z')
// 3 walked away: stopped onward
const d3 = mkDeal('d3 walked', '2026-10-06T00:00:00.000Z'); w.w(pat, 'promise', { status: 'stopped', stop: 'onward' }, { answers: d3.hash, for: d3.hash }, 'd3 pat stops onward')
// 4 delivered but receiver defeats (poor quality) -- done?
const d4 = mkDeal('d4 delivered then defeated', '2026-10-07T00:00:00.000Z'); const i4 = inst('L4')
const t4 = w.w(pat, 'transfer', {}, { what: i4.hash, to_owner: lena.id, for: d4.hash }, 'd4 deliver'); w.w(lena, 'transfer', { status: 'accepted' }, { answers: t4.hash, for: d4.hash }, 'd4 accepted')
w.w(lena, 'observe', { kind: 'complaint', text: 'eggs were off' }, { defeats: t4.hash, for: d4.hash }, 'd4 lena defeats delivery')
// facts only, never a verdict: each promise of Pat's with its stage and the date it names
const promises = (authorId) => w.blocks.filter(b => b.type === 'promise' && b.refs.answers === undefined && b.refs.author === authorId && b.refs.from === authorId).map(first => ({ id: first.hash.slice(0, 6), stage: cmpStage(first.hash.slice(0, 6), first).stage, by: first.state.terms && first.state.terms.deliver_by }))
show('pat promises (stage and by)', promises(pat.id))
// the defeat: no fold looks at defeats of a transfer
// 5 loan
const loanSchema = w.w(lena, 'thing', { kind: 'schema', target: 'promise.loan', fields: { principal: 'money', rate: 'decimal' }, name: 'loan' }, {}, 'loan schema')
const loan = w.w(lena, 'promise', { what: 'loan of 100 GBP, repay 110 by 2027-01-31', principal: GBP(10000), terms: { price: GBP(11000), expires: '2026-12-31T00:00:00.000Z' } }, { from: lena.id, to: bo.id, schema: loanSchema.hash }, 'loan offer (lender->borrower, price=repayment)')
w.w(bo, 'promise', { status: 'accepted' }, { answers: loan.hash, for: loan.hash }, 'bo accepts loan')
const adv = w.w(lena, 'transfer', { money: GBP(10000) }, { to_owner: bo.id, for: loan.hash }, 'lena advances 100')
w.w(bo, 'transfer', { status: 'accepted' }, { answers: adv.hash, for: loan.hash }, 'bo accepts advance')
let s = cmpStage(loan, loan); show('loan after advance stage', s.stage, 'paid', s.paid, 'total', s.total, 'lines', s.lines)
const rep = w.w(bo, 'transfer', { money: GBP(11000) }, { to_owner: lena.id, for: loan.hash }, 'bo repays 110')
w.w(lena, 'transfer', { status: 'accepted' }, { answers: rep.hash, for: loan.hash }, 'lena accepts repayment')
s = cmpStage(loan, loan); show('loan after repayment accepted stage', s.stage, 'paid', s.paid)
// is it done without a "work" block? the loan has no thing and no work answer:
const wk = w.w(lena, 'observe', { kind: 'work', text: 'advanced 100 GBP' }, { for: loan.hash, derives_from: adv.hash }, 'lena work: advance'); w.w(bo, 'observe', { status: 'accepted' }, { answers: wk.hash, for: loan.hash }, 'bo accepts the advance as work')
s = cmpStage(loan, loan); show('loan after advance-as-work accepted + repaid', s.stage, s.paid)
// 6 bearer note
const note = w.w(lena, 'thing', { kind: 'iou-note', name: 'note for 20 GBP' }, { of: kindOf('iou-note') }, 'bearer note thing')
const bearer = w.w(lena, 'promise', { what: 'pay the holder 20 GBP', terms: { price: GBP(2000), expires: '2027-06-01T00:00:00.000Z' } }, { from: lena.id, to: note.hash }, 'bearer promise (to = the note thing)')
const tn = w.w(lena, 'transfer', {}, { what: note.hash, to_owner: bo.id }, 'lena gives note to bo'); w.w(bo, 'transfer', { status: 'accepted' }, { answers: tn.hash }, 'bo accepts note')
const tn2 = w.w(bo, 'transfer', {}, { what: note.hash, to_owner: cy.id }, 'bo passes note to cy'); w.w(cy, 'transfer', { status: 'accepted' }, { answers: tn2.hash }, 'cy accepts note')
show('note owner', (fb.ownerOf(note, w.blocks) || '').slice(0, 6), 'cy=', cy.id.slice(0, 6), 'receiver_of bearer', (fb.fold.receiverOf(bearer, w.blocks) || '').slice(0, 6))
const acc = w.w(cy, 'promise', { status: 'accepted' }, { answers: bearer.hash, for: bearer.hash }, 'cy (holder) accepts bearer promise')
const pay = w.w(lena, 'transfer', { money: GBP(2000) }, { to_owner: cy.id, for: bearer.hash }, 'lena pays holder'); w.w(cy, 'transfer', { status: 'accepted' }, { answers: pay.hash, for: bearer.hash }, 'cy accepts payment')
s = cmpStage(bearer, bearer); show('bearer stage after holder accept + payment', s.stage, 'accept', s.accept, 'sdk-only; oracle', oracle.door('promise_stage', bearer, w.blocks).stage)
// 7 loop clearing: A->B->C->A each owes 10
const A = pat, B = lena, C = bo
const iou = (from, to, label) => { // 'from' sold goods to 'to', unpaid 10: debt = to owes from
  const o = w.w(from, 'promise', { terms: { price: GBP(1000), expires: '2027-01-01T00:00:00.000Z' }, what: 'service' }, { from: from.id, to: to.id }, label + ' deal')
  w.w(to, 'promise', { status: 'accepted' }, { answers: o.hash, for: o.hash }, label + ' accept'); 
  const work = w.w(from, 'observe', { kind: 'work', text: 'did the job' }, { for: o.hash }, label + ' work')
  w.w(to, 'observe', { status: 'accepted' }, { answers: work.hash, for: o.hash }, label + ' work accepted')
  return o }
const dAB = iou(B, A, 'B served A (A owes B)'), dBC = iou(C, B, 'C served B (B owes C)'), dCA = iou(A, C, 'A served C (C owes A)')
for (const d of [dAB, dBC, dCA]) show('before clearing', d.hash.slice(0, 6), cmpStage(d, d).stage, 'paid', fb.promiseStage(d, w.blocks).paid)
// clearing: each debtor writes a set-off money transfer to its creditor, creditor accepts; each names the others in marks
const so = (debtor, creditor, deal, label) => { const t = w.w(debtor, 'transfer', { money: GBP(1000), marks: [{ scheme: 'setoff', value: 'loop-1' }] }, { to_owner: creditor.id, for: deal.hash }, label); w.w(creditor, 'transfer', { status: 'accepted' }, { answers: t.hash, for: deal.hash }, label + ' accepted'); return t }
so(A, B, dAB, 'A sets off 10 to B'); so(B, C, dBC, 'B sets off 10 to C'); so(C, A, dCA, 'C sets off 10 to A')
for (const d of [dAB, dBC, dCA]) show('after clearing', d.hash.slice(0, 6), cmpStage(d, d).stage, 'paid', fb.promiseStage(d, w.blocks).paid)
w.report()
