// Stage 3 of FoodBlock 1.8, amounts (changes-1.8/03-amounts.md): its stories of deals as signed worlds both engines can be run on
// (section 5, stories 12 to 17, 19, 20; section 6, vectors 17 to 20, 26 to 28; things.md's `received` word). Each question names a
// door op, its arguments (`held`: the blocks held when it was asked), `expect` (what the spec text says, with `text`, the sentence it
// says it in) and `core` (what the Rust core answered). Run alone (`node test/audit/k3-deals.cjs`) it prints every question and each
// place the core differs from the text; `require` it for `{ worlds, questions }`.
const L = require('./k3-lib.cjs')
const { World, kindOf, amt, put, thing, give, yes, deal, ownerView, drawView, D, codes } = L

const questions = []
const ask = L.makeAsk(questions)
const gbp = (n) => amt(n, 'GBP')
// A payment: a transfer naming no instance, `to_owner` the payee, `for` the deal.
const pay = (w, p, to, amount, head, note, refs = {}) => put(w, p, 'transfer', { amount }, { to_owner: to.id, for: head.hash, ...refs }, note)
const stageView = (...keys) => (s) => {
  if (!s || s.not_shown || s.error) return s
  const out = {}
  for (const k of keys) {
    if (k === 'moved') out.moved = L.v(s.lines && s.lines[0] && s.lines[0].moved)
    else if (k === 'uncovered') out.uncovered = s.uncovered ? { from: (s.uncovered.from || []).map((x) => ({ line: x.line, amount: L.v(x.amount) })), to: L.v(s.uncovered.to) } : s.uncovered
    else out[k] = L.v(s[k])
  }
  return out
}

// ---- 1. A loan of maize, repaid with interest in kind; and repaid in sand (story 12, 17; vector 18) ----
{
  const w = new World('k3 a loan of maize')
  const maria = w.person('maria'), harry = w.person('harry')
  const maize = kindOf('maize')
  const lot = thing(w, maria, 'maize', amt(20, 'sack'), 'maria\'s lot of 20 sacks')
  const loan = deal(w, maria, harry, lot, { quantity: amt(5, 'sack'), price: amt(6, 'sack', maize) }, 'maria lends harry five sacks for six')
  const out = give(w, maria, lot, harry, amt(5, 'sack'), 'maria\'s five sacks', { for: loan.offer.hash, after: [loan.accept.hash] })
  ask(w, 'maize loan', 'her five sacks land (his accept of the deal is in their past)', 'ownership', [lot, 'held', null], D(true, null, 'landed'),
    'folds.md, Lands: her yes (her binding accept of the deal the draw is for, in the draw\'s own past)', drawView(out.hash))
  ask(w, 'maize loan', 'underway, moved 5', 'promise_stage', [loan.offer, 'held', {}], { stage: 'underway', moved: '5' },
    'folds.md, A promise\'s stage 2: one that names an instance, only as a draw on it that lands', stageView('stage', 'moved'))
  const his = thing(w, harry, 'maize', amt(10, 'sack'), 'harry\'s own lot, refs.of the maize kind')
  const back = give(w, harry, his, maria, amt(6, 'sack'), 'harry repays six sacks', { for: loan.offer.hash })
  yes(w, maria, back, 'maria accepts the six')
  ask(w, 'maize loan', 'repaid six of the maize kind: done', 'promise_stage', [loan.offer, 'held', {}], { stage: 'done', paid: '6' },
    'folds.md, What is left, The other side: A transfer that names an instance counts toward a price only where the price states an of and the instance\'s refs.of is that id', stageView('stage', 'paid'))
}
{
  const w = new World('k3 a price paid in sand')
  const sam = w.person('sam'), ben = w.person('ben')
  const maize = kindOf('maize')
  const lot = thing(w, sam, 'maize', amt(10, 'sack'), 'sam\'s maize')
  const withOf = deal(w, sam, ben, lot, { quantity: amt(5, 'sack'), price: amt(6, 'sack', maize) }, 'sam lends ben five for six of the maize kind')
  const out = give(w, sam, lot, ben, amt(5, 'sack'), 'sam\'s five', { for: withOf.offer.hash, after: [withOf.accept.hash] })
  void out
  const sand = put(w, ben, 'thing', { kind: 'sand', pack: amt(6, 'sack') }, { of: maize }, 'ben\'s sand, which he signs as maize')
  const lie = give(w, ben, sand, sam, amt(6, 'sack'), 'ben pays in sand', { for: withOf.offer.hash })
  yes(w, sam, lie, 'sam accepts it')
  ask(w, 'sand', 'a sand thing Ben signed with refs.of maize pays it', 'promise_stage', [withOf.offer, 'held', {}], 'done',
    'story 17: a sand thing Ben signed with refs.of maize pays it, and Ben has signed a lie Sam holds', (s) => (s && s.stage) || s)
  const lot2 = thing(w, sam, 'maize', amt(10, 'sack'), 'sam\'s second maize')
  const noOf = deal(w, sam, ben, lot2, { quantity: amt(5, 'sack'), price: amt(6, 'sack') }, 'the same, priced 6 sacks with no of')
  give(w, sam, lot2, ben, amt(5, 'sack'), 'sam\'s five again', { for: noOf.offer.hash, after: [noOf.accept.hash] })
  const sand2 = put(w, ben, 'thing', { kind: 'sand', pack: amt(6, 'sack') }, { of: kindOf('sand') }, 'ben\'s honest sand')
  const t = give(w, ben, sand2, sam, amt(6, 'sack'), 'ben pays in sand', { for: noOf.offer.hash })
  yes(w, sam, t, 'sam: it came (no covers)')
  ask(w, 'sand', 'a price with no of, paid in sand, accepted without covers: paid 0', 'promise_stage', [noOf.offer, 'held', {}], '0',
    'folds.md, The other side: toward a price with no of it counts only for what the payee\'s accepted answer says it covers', (s) => L.v(s.paid))
}

// ---- 2. A loan of pounds, repaid with interest (story 12, vector 17) ----
function poundsLoan(name) {
  const w = new World(name)
  const sam = w.person('sam'), maria = w.person('maria')
  const loan = deal(w, sam, maria, null, { quantity: gbp(100), price: gbp(110) }, 'sam lends maria £100 at £110')
  return { w, sam, maria, loan }
}
{
  const { w, sam, maria, loan } = poundsLoan('k3 a loan of pounds')
  ask(w, 'pound loan', 'accepted, nothing sent: uncovered empty both sides', 'promise_stage', [loan.offer, 'held', {}], { stage: 'accepted', uncovered: { from: [], to: null } },
    'UNCLEAR: story 12 says uncovered null both sides; folds.md says null (or []) when that side sent nothing: from is a list, so [] here',
    stageView('stage', 'uncovered'))
  const lent = pay(w, sam, maria, gbp(100), loan.offer, 'sam sends £100, naming no instance')
  ask(w, 'pound loan', 'before Maria accepts: unanswered', 'promise_stage', [loan.offer, 'held', {}], { stage: 'accepted', unanswered: [lent.hash] },
    'folds.md, uncovered: A transfer of hers that names no instance and that the other side has not accepted is listed in unanswered: [block]',
    (s) => (s.not_shown ? s : { stage: s.stage, unanswered: s.unanswered }))
  yes(w, maria, lent, 'maria accepts the £100')
  ask(w, 'pound loan', 'underway, moved 100', 'promise_stage', [loan.offer, 'held', {}], { stage: 'underway', moved: '100' },
    'folds.md, stage 2: Where the promise names no what, what moves is its terms.quantity, an amount (a loan of money)', stageView('stage', 'moved'))
  const back = pay(w, maria, sam, gbp(110), loan.offer, 'maria repays £110')
  yes(w, sam, back, 'sam accepts the £110')
  ask(w, 'pound loan', 'done, paid 110', 'promise_stage', [loan.offer, 'held', {}], { stage: 'done', paid: '110' }, 'story 12: Maria repays £110, Sam accepts: done', stageView('stage', 'paid'))
}
{
  const { w, sam, maria, loan } = poundsLoan('k3 a loan of pounds stopped unpaid')
  const lent = pay(w, sam, maria, gbp(100), loan.offer, 'sam sends £100')
  const y = yes(w, maria, lent, 'maria accepts')
  put(w, maria, 'promise', { status: 'stopped', stop: 'onward' }, { answers: loan.offer.hash, for: loan.offer.hash, after: [y.hash] }, 'maria stops onward, having repaid nothing')
  ask(w, 'pound loan stopped', 'stopped; Sam\'s £100 shown in uncovered.from', 'promise_stage', [loan.offer, 'held', {}], { stage: 'stopped', uncovered: { from: [{ line: null, amount: '100' }], to: null } },
    'folds.md, uncovered: from (the delivering side) is [{ line, amount }] ... line null without lines; story 12: stopped, uncovered.from £100', stageView('stage', 'uncovered'))
}

// ---- 3. A miller's toll in kind (story 13, vector 19) ----
{
  const w = new World('k3 a miller\'s toll in kind')
  w.person('leila')
  const flour = kindOf('flour')
  const terms = { price: { amount: amt(1, 'kg', flour), per: amt(10, 'kg') }, quantity: amt(93, 'kg') }
  ask(w, 'toll', '1 kg of flour per 10 kg, 93 kg: 9.3 kg of flour', 'terms_total', [terms, null], amt('9.3', 'kg', flour),
    'promises.md, Terms: The total is the amount\'s value times the quantity over per\'s value, exact; nothing is rounded')
  ask(w, 'toll', 'the same with the quantity chosen 93 kg', 'terms_total', [{ price: terms.price }, amt(93, 'kg')], amt('9.3', 'kg', flour), 'folds.md, stage 2: what the terms come to, an amount, exact')
}

// ---- 4. A community voucher (story 14, vector 28) ----
{
  const w = new World('k3 a community voucher')
  const maria = w.person('maria'), ravi = w.person('ravi'), cafe = w.person('cafe'), baker = w.person('baker')
  const K = put(w, maria, 'thing', { kind: 'bread credit', text: 'Maria\'s bread credit' }, {}, 'the kind K, a kind by its own block')
  const credit = (n, of = K.hash) => amt(n, 'credit', of)
  const off = deal(w, cafe, ravi, kindOf('coffee'), { quantity: amt(1, 'cup'), price: credit(5) }, 'the café sells ravi a coffee for 5 credit')
  const p = pay(w, ravi, cafe, credit(5), off.offer, 'ravi pays 5 credit, off the record')
  yes(w, cafe, p, 'the café accepts')
  ask(w, 'voucher', 'off the record: it counts on the café\'s accept', 'promise_stage', [off.offer, 'held', {}], '5',
    'things.md, Transfers: One that names none ... counts toward its line only on the receiver\'s accept', (s) => L.v(s.paid))
  const wrong = deal(w, cafe, ravi, kindOf('coffee'), { quantity: amt(1, 'cup'), price: credit(5) }, 'a second coffee')
  const p2 = pay(w, ravi, cafe, amt(5, 'credit'), wrong.offer, 'ravi pays 5 credit with no of')
  yes(w, cafe, p2, 'the café accepts')
  ask(w, 'voucher', 'paid with 5 credit with no of: of another kind, paid 0', 'promise_stage', [wrong.offer, 'held', {}], '0',
    'story 14: Paid with 5 credit with no of: of another kind, paid 0, shown', (s) => L.v(s.paid))
  const issue = put(w, maria, 'thing', { kind: 'bread credit', pack: amt(500, 'credit') }, { of: K.hash }, 'maria\'s issue: an instance of K, pack 500 credit')
  const toRavi = give(w, maria, issue, ravi, amt(5, 'credit'), '5 credit of the issue to ravi')
  const ry = yes(w, ravi, toRavi, 'ravi accepts')
  const spend1 = give(w, ravi, issue, cafe, amt(5, 'credit'), 'ravi spends the 5 at the café', { after: [ry.hash] })
  const spend2 = give(w, ravi, issue, baker, amt(5, 'credit'), 'ravi spends the same 5 at the baker')
  ask(w, 'voucher', 'on the record: the second spend of the same 5 reads past', 'ownership', [issue, 'held', null], { first: D(true, null, 'held'), second: D(false, 'past', null) },
    '03-amounts vector 28: Voucher issue pack 500 credit: second spend of the same 5: past',
    (o) => (o.not_shown ? o : { first: drawView(spend1.hash)(o), second: drawView(spend2.hash)(o) }))
}

// ---- 5. Gold and bitcoin (story 15) ----
{
  const w = new World('k3 gold and bitcoin')
  const sam = w.person('sam'), leila = w.person('leila')
  const gold = kindOf('gold')
  const loaf = thing(w, sam, 'loaf', null, 'sam\'s loaf')
  const sale = deal(w, sam, leila, loaf, { price: amt(2, 'g', gold) }, 'sam sells a loaf for 2 g of gold')
  const t = give(w, sam, loaf, leila, null, 'the loaf', { for: sale.offer.hash, after: [sale.accept.hash] })
  void t
  const p = pay(w, leila, sam, amt(2, 'g', gold), sale.offer, 'leila pays 2 g of gold, off the record')
  yes(w, sam, p, 'sam accepts')
  ask(w, 'gold', 'paid by an off-record transfer Sam accepts: done', 'promise_stage', [sale.offer, 'held', {}], { stage: 'done', paid: '2' }, 'story 15: A price { "2", g, of: gold }, paid by an off-record transfer Sam accepts: done', stageView('stage', 'paid'))
  ask(w, 'bitcoin', '0.00000001 BTC per kg times 3 kg', 'terms_total', [{ price: { amount: amt('0.00000001', 'BTC'), per: amt(1, 'kg') } }, amt(3, 'kg')], amt('0.00000003', 'BTC'),
    'story 15: { "0.00000001", BTC } per kg times 3 kg: { "0.00000003", BTC }, exact')
}

// ---- 6. A mixed deal priced in pounds and eggs (story 16) ----
{
  const w = new World('k3 a deal priced in pounds and eggs')
  const sam = w.person('sam'), leila = w.person('leila')
  const loaf = thing(w, sam, 'loaf', null, 'a loaf'), buns = thing(w, sam, 'buns', amt(6, 'bun'), 'six buns')
  const l = L.next(w, sam.keys, sam)
  const mixed = w.add(L.signed(sam, sam.keys, 'promise', { terms: { lines: [{ id: 'loaf', what: loaf.hash, quantity: amt(1, 'loaf'), price: gbp(1) }, { id: 'buns', what: buns.hash, quantity: amt(6, 'bun'), price: amt(2, 'egg') }] } },
    { what: [loaf.hash, buns.hash].sort(), from: sam.id, to: leila.id }, { prev: l.prev, seq: l.seq }), 'lines priced in pounds and in eggs')
  ask(w, 'mixed', 'refused by read: lines', 'read', [mixed, 'held'], ['lines'], 'promises.md, Terms: Every line\'s price is of one kind (lines)', codes)
}

// ---- 7. A reversed payment after a resale (story 19, vector 26) ----
{
  const w = new World('k3 a reversed payment after a resale')
  const femi = w.person('femi'), cafe = w.person('cafe'), leila = w.person('leila'), rail = w.person('rail')
  const mixer = thing(w, femi, 'mixer', null, 'femi\'s mixer')
  const sale = deal(w, femi, cafe, mixer, { price: gbp(1200) }, 'femi sells the café a mixer for £1,200')
  // The condition `{ paid: <the sale> }`, as things.md (Title until paid) writes it.
  const title = put(w, femi, 'transfer', { condition: { paid: sale.offer.hash } }, { what: mixer.hash, to_owner: cafe.id, for: sale.offer.hash, after: [sale.accept.hash] }, 'the mixer to the café, conditioned on paid')
  const p = pay(w, cafe, femi, gbp(1200), sale.offer, 'the café pays £1,200')
  const fy = yes(w, femi, p, 'femi accepts the payment')
  const said = put(w, rail, 'observe', { kind: 'paid', text: 'payment came' }, { subject: p.hash }, 'the provider says the payment came')
  const ca = yes(w, cafe, title, 'the café accepts the mixer', {}, { after: [fy.hash] })
  const resale = give(w, cafe, mixer, leila, null, 'the café resells to leila', { after: [ca.hash] })
  yes(w, leila, resale, 'leila accepts, unseen')
  put(w, rail, 'observe', { kind: 'note', text: 'reversed' }, { defeats: said.hash }, 'the provider defeats its word that the payment came')
  ask(w, 'reversed', 'the take-back changes nothing: owner Leila', 'ownership', [mixer, 'held', null], 'leila',
    'folds.md, What is left: What landed stays landed: a payment reversed after the draw landed and stood is a sum the receiver owes the giver, and never takes goods from a later buyer', ownerView(w))
  ask(w, 'reversed', 'the price paid, nothing uncovered', 'promise_stage', [sale.offer, 'held', {}], { stage: 'done', paid: '1200', uncovered: { from: [], to: '0' } },
    'story 19: the price paid; uncovered.to is 0 (she sent, and all of it was covered); from is [] (the mixer\'s line states no quantity)',
    stageView('stage', 'paid', 'uncovered'))
}

// ---- 8. A sum past 2^53 (story 20, vector 20) ----
{
  const w = new World('k3 a sum past 2^53')
  const sam = w.person('sam'), leila = w.person('leila')
  const big = amt('100000000000000000000', 'KES')
  const farm = thing(w, sam, 'farm', null, 'a farm')
  const sale = deal(w, sam, leila, farm, { price: big }, 'a farm for 10^20 shillings')
  ask(w, 'past 2^53', 'the offer is valid', 'valid', [sale.offer, 'held'], [], 'story 20: valid (20 digits, within limits.decimal_digits)', codes)
  ask(w, 'past 2^53', 'and read', 'read', [sale.offer, 'held'], [], 'encoding.md, A sum: It has no cap: integers bounds a count and seq, never an amount', codes)
  ask(w, 'past 2^53', 'terms_total exact', 'terms_total', [sale.offer.state.terms, null], big, 'encoding.md, A sum: exact')
  give(w, sam, farm, leila, null, 'the farm', { for: sale.offer.hash, after: [sale.accept.hash] })
  const p = pay(w, leila, sam, big, sale.offer, 'leila pays')
  yes(w, sam, p, 'sam accepts')
  ask(w, 'past 2^53', 'total and paid exact text', 'promise_stage', [sale.offer, 'held', {}], { stage: 'done', total: '100000000000000000000', paid: '100000000000000000000' },
    'story 20: its total and paid are exact text', stageView('stage', 'total', 'paid'))
}

// ---- 9. A basic phone's `received` (folds.md, What is left, The other side) ----
{
  const w = new World('k3 a basic phone\'s received')
  const mama = w.person('mama'), leila = w.person('leila')
  const order = deal(w, mama, leila, kindOf('maize'), { quantity: amt(2, 'kg'), price: amt(100, 'KES') }, 'leila orders 2 kg for 100 shillings')
  pay(w, leila, mama, amt(100, 'KES'), order.offer, 'leila sends 100 shillings')
  put(w, mama, 'observe', { kind: 'received', amount: amt(100, 'KES') }, { for: order.offer.hash }, 'mama\'s basic phone: received 100')
  ask(w, 'received', 'her received word counts toward the price', 'promise_stage', [order.offer, 'held', {}], '100',
    'folds.md, The other side: A receiver with nothing to answer ... signs her own observe of kind received, refs.for the deal, state.amount what came ... added toward the price where she is the payee',
    (s) => L.v(s.paid))
}

// ---- 10. Two sides each sent (vector 27) ----
{
  const w = new World('k3 paid twice')
  const sam = w.person('sam'), leila = w.person('leila')
  const tractor = thing(w, sam, 'tractor', null, 'sam\'s tractor')
  const sale = deal(w, sam, leila, tractor, { price: gbp(500) }, 'a tractor for £500')
  give(w, sam, tractor, leila, null, 'the tractor', { for: sale.offer.hash, after: [sale.accept.hash] })
  for (const n of [1, 2]) { const p = pay(w, leila, sam, gbp(500), sale.offer, `leila pays £500 (${n})`); yes(w, sam, p, `sam accepts (${n})`) }
  ask(w, 'paid twice', 'done, uncovered.to £500', 'promise_stage', [sale.offer, 'held', {}], { stage: 'done', to: '500' },
    'folds.md, uncovered: to (the paying side) ... what she paid, less transfers back, less the price of what moved to her (vector 27)', (s) => (s.not_shown ? s : { stage: s.stage, to: L.v(s.uncovered && s.uncovered.to) }))
}

// ---- 11. One transfer answered twice: 10 l, then 20 l (the compare step's story: one payment counts once) ----
{
  const w = new World('k3 one transfer answered twice')
  const sam = w.person('sam'), amara = w.person('amara')
  const milk = kindOf('milk')
  const order = deal(w, sam, amara, milk, { quantity: amt(30, 'l'), price: gbp(30) }, 'amara orders 30 l of milk')
  const t = put(w, sam, 'transfer', { amount: amt(30, 'l') }, { to_owner: amara.id, for: order.offer.hash }, 'sam sends 30 l, naming no instance')
  yes(w, amara, t, 'amara: accepted, 10 l', { amount: amt(10, 'l') })
  yes(w, amara, t, 'amara: accepted, 20 l', { amount: amt(20, 'l') })
  ask(w, 'answered twice', 'moved 20 l: the most her side said of it, counted once', 'promise_stage', [order.offer, 'held', {}], { stage: 'underway', moved: '20' },
    'folds.md, What is left, The other side: one transfer counts once, at the most its receiving side has said of it (not 30, not 10)', stageView('stage', 'moved'))
}

const names = new Set(questions.map((q) => q.world))
if (require.main === module) L.report(questions)
module.exports = { worlds: global.__worlds.filter((w) => w.name.startsWith('k3 ') && names.has(w.name)), questions }
