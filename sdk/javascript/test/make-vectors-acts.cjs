// Adds to spec/vectors.json the cases of `act_check` (a deal against the act template it names) and `gives` (what of a person's becomes whose if a block
// stands): promises.md, An act is a template of the one shape, and What becomes whose. `node test/make-vectors-acts.cjs`, after `node scripts/build-wasm.cjs`.
// Idempotent. Each expectation is written by hand from the spec text; the Rust core must give it and so must the oracle (spec/oracle).
const assert = require('assert/strict')
const vectorsFile = require('./vectors-file.cjs')
const { V, tags } = vectorsFile.load()
const kit = require('./vectors-kit.cjs')(V)
const { story, door, LATER, M } = kit

// `why` is a sentence, not a rule: the cases check `ok`, and this maker checks that a deal that does not fit always says why
const check = (name, deal, template, held, expect, invariants) => {
  const got = door(`act: ${name}`, 'act_check', [deal, template], { expect: { ok: expect.ok }, invariants })
  assert.equal(typeof got.why, expect.ok ? 'object' : 'string', `${name}: a deal that does not fit says why, and one that does says nothing`)
}
const gives = (name, block, who, held, lines, invariants) => door(`gives: ${name}`, 'gives', [block, who.id, held], { expect: { gives: lines }, exact: true, invariants })
const line = (of, to, back, parts) => ({ of, ...parts, to: to === null ? null : to.id, back })
const HOUR = (n) => ({ value: String(n), unit: 'h' })
const PER_HOUR = { money: M(1500), per: HOUR(1) }
const move = (type, extra = {}) => ({ type, tie: 'none', sides: 'mine to theirs', needs: [], words: ['what', 'terms'], ...extra })
const template = (s, who, state = {}) => s.say(who, 'thing', {
  kind: 'act', name: 'Renting a kitchen by the hour', words: 'The owner of a kitchen lets someone use it for the hours they choose.',
  sides: { from: 'the owner', to: 'the renter' }, takes: { price: 'price_per', quantity: 'range', until: 'time' }, needs: ['price'],
  record: { Promise: move('promise'), Accept: { type: 'as the anchor', tie: 'answers', sides: 'kept', needs: [], words: ['status', 'quantity'] } }, ...state }, {})
const accept = (s, who, offer, quantity) => s.say(who, 'promise', { status: 'accepted', ...(quantity ? { terms: { quantity } } : {}) }, { answers: offer.hash, for: offer.hash, after: [offer.hash] })

{
  // a stranger publishes "rent a kitchen by the hour": any signer, no one's list
  const s = story(), owner = s.person('ac-owner'), renter = s.person('ac-renter'), stranger = s.person('ac-stranger')
  const t = template(s, stranger)
  const kitchen = s.say(owner, 'thing', { kind: 'kitchen' }, {})
  const bench = s.say(owner, 'thing', { name: 'the shared kitchen' }, { of: kitchen.hash })
  const terms = { price: PER_HOUR, quantity: { min: HOUR(1), max: HOUR(8) }, until: LATER }
  const deal = s.say(owner, 'promise', { what: 'kitchen by the hour', terms }, { from: owner.id, to: renter.id, what: bench.hash, act: t.hash })
  check('a stranger\'s template: the deal has its sides and its terms', deal, t, s.held, { ok: true, why: null }, [32])
  gives('rent a kitchen: the owner offers her kitchen, which comes back when the rent ends (the hours are a range: no amount yet)', deal, owner, s.held, [line('use', renter, LATER, { what: bench.hash })])
  gives('and the renter gives money only once the hours are chosen: a price per hour with a range has no total yet', deal, renter, s.held, [])
  const took = accept(s, renter, deal, HOUR(3))
  gives('the renter\'s accept of three hours gives £45 to the owner', took, renter, s.held, [line('money', owner, null, { minor: 4500, currency: 'GBP' })])
  gives('and the same accept gives the owner\'s side: the kitchen, for the three hours', took, owner, s.held, [line('use', renter, LATER, { what: bench.hash, amount: HOUR(3) })])
  const nobody = s.person('ac-nobody')
  gives('a person who is on neither side gives nothing', took, nobody, s.held, [])
  const declined = s.say(renter, 'promise', { status: 'declined' }, { answers: deal.hash, for: deal.hash, after: [deal.hash] })
  gives('a decline moves nothing', declined, renter, s.held, [])
  const openDeal = s.say(owner, 'promise', { what: 'kitchen by the hour', terms }, { from: owner.id, what: bench.hash })
  gives('an offer to anyone: the thing becomes the use of no one yet (to is null)', openDeal, owner, s.held, [line('use', null, LATER, { what: bench.hash })])
  const rival = s.person('ac-rival')
  const theirs = s.say(rival, 'promise', { what: 'kitchen by the hour', terms }, { from: rival.id, to: renter.id, what: bench.hash })
  gives('a kitchen another person owns is not hers to give: the rival\'s offer of the owner\'s kitchen gives nothing of hers', theirs, rival, s.held, [])
}
{
  // a device brings its own act: it signs with its own key, its template says what it can do and the deal is read from terms alone
  const s = story(), mower = s.person('dv-mower', { kind: 'agent' }), customer = s.person('dv-customer')
  const t = template(s, mower, { name: 'Mowing a lawn by the square metre', words: 'The mower cuts grass.', sides: { from: 'the mower', to: 'the customer' }, takes: { price: 'price_per', quantity: 'amount' }, needs: ['price', 'quantity'], record: { Promise: move('promise') } })
  const deal = s.say(mower, 'promise', { what: 'mow the lawn', terms: { price: { money: M(20), per: { value: '10', unit: 'm2' } }, quantity: { value: '200', unit: 'm2' } } }, { from: mower.id, to: customer.id, act: t.hash })
  check('a device\'s own act: the mower offers its work by the square metre and the deal fits', deal, t, s.held, { ok: true, why: null }, [32])
  gives('the customer gives £400 to the mower for 200 square metres', deal, customer, s.held, [line('money', mower, null, { minor: 400, currency: 'GBP' })])
  gives('the mower gives no thing: work is not a thing, and a signed word of work binds the signer\'s name, never her body', deal, mower, s.held, [])
  const lent = s.person('dv-owner')
  const unit = s.say(lent, 'thing', { kind: 'greenhouse robot' }, {})
  const robot = s.say(lent, 'thing', { name: 'robot 7' }, { of: unit.hash })
  const lend = s.say(lent, 'promise', { what: 'the robot for a week', terms: { until: LATER, price: M(2500) } }, { from: lent.id, to: customer.id, what: robot.hash })
  gives('a device she owns, lent until a date: a use that comes back then, and the price owed to her gives her nothing', lend, lent, s.held, [line('use', customer, LATER, { what: robot.hash })])
  gives('and the one who rents it gives the price', lend, customer, s.held, [line('money', lent, null, { minor: 2500, currency: 'GBP' })])
  const handover = s.say(lent, 'transfer', {}, { what: robot.hash, to_holder: customer.id, for: lend.hash })
  gives('the hand-over of the holding names no owner: a use that comes back at the until of the deal it is for', handover, lent, s.held, [line('use', customer, LATER, { what: robot.hash })])
  const sold = s.say(lent, 'transfer', {}, { what: robot.hash, to_owner: customer.id, for: lend.hash })
  gives('a transfer of ownership is goods, which do not come back', sold, lent, s.held, [line('goods', customer, null, { what: robot.hash })])
  gives('and gives nothing of the receiver\'s', sold, customer, s.held, [])
}
{
  // a template whose words claim no money while its terms move money: gives reads the terms
  const s = story(), cafe = s.person('fr-cafe'), guest = s.person('fr-guest')
  const t = template(s, cafe, { name: 'Free tasting', words: 'No charge. Nothing to pay. Nothing leaves you.', sides: { from: 'the cafe', to: 'the guest' }, takes: { price: 'money', quantity: 'amount' }, needs: [], record: { Promise: move('promise') } })
  const deal = s.say(cafe, 'promise', { what: 'a tasting', terms: { price: M(500), quantity: { value: '1', unit: 'tasting' } } }, { from: cafe.id, to: guest.id, act: t.hash })
  check('the template\'s words are pencil: a free tasting whose terms carry a price still fits', deal, t, s.held, { ok: true, why: null }, [32])
  gives('gives shows the money the terms move, not the words: £5 leaves the guest', deal, guest, s.held, [line('money', cafe, null, { minor: 500, currency: 'GBP' })], [32])
  const claiming = s.say(cafe, 'thing', { kind: 'act', name: 'Free tasting', money: M(0), sides: { from: 'a' }, takes: {}, record: { Promise: move('promise') } }, {})
  const d2 = s.say(cafe, 'promise', { what: 'a tasting', terms: {} }, { from: cafe.id, act: claiming.hash })
  check('a template cannot carry money: a field outside the protocol\'s own makes it not whole', d2, claiming, s.held, { ok: false, why: 'the template is not whole: `money` is no field of an act: a template\'s words claim nothing, so it cannot carry money, an effect or an authority' }, [32])
  const effect = s.say(cafe, 'thing', { kind: 'act', name: 'Hot oven', effect: { hazard: 'heat' }, sides: {}, takes: {}, record: { Promise: move('promise') } }, {})
  check('nor an effect', s.say(cafe, 'promise', { what: 'x' }, { from: cafe.id, act: effect.hash }), effect, s.held, { ok: false, why: 'the template is not whole: `effect` is no field of an act: a template\'s words claim nothing, so it cannot carry money, an effect or an authority' })
}
{
  // a deal that contradicts its template is refused with a reason
  const s = story(), a = s.person('ct-a'), b = s.person('ct-b'), c = s.person('ct-c')
  const t = template(s, a, { sides: { from: 'the seller' }, takes: { price: 'money', quantity: 'amount', expires: 'time' }, needs: ['price'], record: { Promise: move('promise') } })
  const ok = s.say(a, 'promise', { what: 'sacks', terms: { price: M(900), quantity: { value: '1', unit: 'sack' } } }, { from: a.id, act: t.hash })
  check('an offer to anyone, as the template has it', ok, t, s.held, { ok: true, why: null }, [32])
  const named = s.say(a, 'promise', { what: 'sacks', terms: { price: M(900) } }, { from: a.id, to: b.id, act: t.hash })
  check('a side the template does not have: the deal names a receiver', named, t, s.held, { ok: false, why: 'the template has the sides `from`; the deal names `from`, `to`' }, [32])
  const noSide = s.say(b, 'promise', { what: 'sacks', terms: { price: M(900) } }, { to: b.id, act: t.hash })
  check('a side the template has is missing: the deal names only a receiver', noSide, t, s.held, { ok: false, why: 'the template has the sides `from`; the deal names `to`' })
  const extra = s.say(a, 'promise', { what: 'sacks', terms: { price: M(900), personal: true } }, { from: a.id, act: t.hash })
  check('a term the template does not take', extra, t, s.held, { ok: false, why: 'the deal has the term `personal`, which the template does not take' })
  const wrongType = s.say(a, 'promise', { what: 'sacks', terms: { price: { value: '3', unit: 'sack' } } }, { from: a.id, act: t.hash })
  check('a term of another type: a price in goods where the template says money', wrongType, t, s.held, { ok: false, why: 'the term `price` is not a money, as the template says' })
  const missing = s.say(a, 'promise', { what: 'sacks', terms: { quantity: { value: '1', unit: 'sack' } } }, { from: a.id, act: t.hash })
  check('a term the template needs is missing', missing, t, s.held, { ok: false, why: 'the template needs the term `price`; the deal has none' })
  const other = template(s, c, { name: 'Another way to sell', sides: { from: 'the seller' }, takes: { price: 'money' }, record: { Promise: move('promise') } })
  check('a deal names one template and is read against that one: another template, another hash', ok, other, s.held, { ok: false, why: `the deal names the act ${t.hash}, not this template` }, [32])
  const bare = s.say(a, 'promise', { what: 'sacks', terms: { price: M(900) } }, { from: a.id })
  check('a deal that names no act', bare, t, s.held, { ok: false, why: 'the deal names no act (`refs.act`)' })
  const notAct = s.say(a, 'thing', { kind: 'schema', name: 'not an act' }, {})
  check('a block that is no template', ok, notAct, s.held, { ok: false, why: 'the template is not whole: an act template is a thing of kind `act`' })
  const takes = s.say(b, 'promise', { status: 'accepted' }, { answers: ok.hash, for: ok.hash, after: [ok.hash], act: t.hash })
  check('a bare answer that names the act is checked as an answer: its sides and terms are the deal\'s', takes, t, s.held, { ok: true, why: null })
  const pay = s.say(b, 'transfer', { money: M(900) }, { to_owner: a.id, for: ok.hash, act: t.hash })
  check('a block no move of the template writes: this template writes a promise, not a transfer', pay, t, s.held, { ok: false, why: 'no move of the template is written as a `transfer`' })
  const wide = s.say(a, 'thing', { kind: 'act', name: 'Any way', sides: {}, takes: {}, record: { Pay: { type: 'transfer', tie: 'for', sides: 'mine to theirs', needs: [], words: ['money'] } } }, {})
  check('a template that writes a payment fits a transfer that names it (the sides and terms are a promise\'s to read)', s.say(b, 'transfer', { money: M(900) }, { to_owner: a.id, for: ok.hash, act: wide.hash }), wide, s.held, { ok: true, why: null })
  const badForm = s.say(a, 'thing', { kind: 'act', name: 'Odd', sides: {}, takes: {}, record: { Dance: move('promise') } }, {})
  check('a move that is not one of the twenty', bare, badForm, s.held, { ok: false, why: 'the template is not whole: `record` is how each move the act takes is written down; the moves are `Promise`, `Start`, `Accept`, `Decline`, `Change`, `Question`, `Answer`, `Note`, `Invite`, `Pass`, `Leave`, `Remove`, `Hand over`, `Pay`, `Receive`, `Done`, `Withdraw`, `End`, `Pause`, `Resume`' })
}
{
  // gives: goods, a price in goods, lines, a chosen quantity, a payment, a transfer, an agent under her grant
  const s = story(), ann = s.person('gv-ann'), bob = s.person('gv-bob'), bot = s.person('gv-bot', { kind: 'agent' })
  const sack = s.say(ann, 'thing', { kind: 'sack of flour' }, {})
  const sale = s.say(ann, 'promise', { what: 'flour', terms: { price: M(300), quantity: { value: '5', unit: 'sack' } } }, { from: ann.id, to: bob.id, what: sack.hash })
  gives('a sale: the seller gives five sacks of the kind she names', sale, ann, s.held, [line('goods', bob, null, { what: sack.hash, amount: { value: '5', unit: 'sack' } })], [32])
  gives('and the buyer gives the price', sale, bob, s.held, [line('money', ann, null, { minor: 300, currency: 'GBP' })], [32])
  const barter = s.say(ann, 'promise', { what: 'flour', terms: { price: { value: '6', unit: 'sack of maize' } } }, { from: ann.id, to: bob.id, what: sack.hash })
  gives('a price in goods is goods: money is one good among many', barter, bob, s.held, [line('goods', ann, null, { amount: { value: '6', unit: 'sack of maize' } })], [32])
  const ma = s.say(ann, 'thing', { kind: 'maize' }, {}), tea = s.say(ann, 'thing', { kind: 'tea' }, {})
  const order = s.say(ann, 'promise', { what: 'an order', terms: { lines: [{ id: 'a', what: ma.hash, quantity: { value: '2', unit: 'kg' }, price: M(400) }, { id: 'b', what: tea.hash, quantity: { value: '1', unit: 'kg' }, price: M(250) }] } }, { from: ann.id, to: bob.id, what: [ma.hash, tea.hash].sort() })
  gives('an order of two lines: each line a thing with its own quantity', order, ann, s.held, [
    line('goods', bob, null, { what: ma.hash, amount: { value: '2', unit: 'kg' } }), line('goods', bob, null, { what: tea.hash, amount: { value: '1', unit: 'kg' } })])
  gives('and the lines add into one price', order, bob, s.held, [line('money', ann, null, { minor: 650, currency: 'GBP' })])
  const perKg = s.say(ann, 'promise', { what: 'maize', terms: { price: { money: M(200), per: { value: '1', unit: 'kg' } }, quantity: { min: { value: '1', unit: 'kg' }, max: { value: '20', unit: 'kg' } } } }, { from: ann.id, to: bob.id, what: ma.hash })
  const five = accept(s, bob, perKg, { value: '5', unit: 'kg' })
  gives('an accept reads the offer at the quantity it chooses: five kilos at £2', five, bob, s.held, [line('money', ann, null, { minor: 1000, currency: 'GBP' })], [32])
  gives('and the seller\'s five kilos', five, ann, s.held, [line('goods', bob, null, { what: ma.hash, amount: { value: '5', unit: 'kg' } })])
  const toSelf = s.say(ann, 'promise', { what: 'a plan', terms: { price: M(100) } }, { from: ann.id, to: ann.id, what: sack.hash })
  gives('a promise to herself moves nothing to anyone else', toSelf, ann, s.held, [])
  const note = s.say(ann, 'observe', { kind: 'note', text: 'I will give you all my money' }, {})
  gives('words give nothing: a note, however it reads, is no money', note, ann, s.held, [], [32])
  const pay = s.say(bob, 'transfer', { money: M(300) }, { to_owner: ann.id, for: sale.hash })
  gives('a payment: the payer\'s money goes to the payee', pay, bob, s.held, [line('money', ann, null, { minor: 300, currency: 'GBP' })], [32])
  gives('and the one paid gives nothing', pay, ann, s.held, [])
  const grant = s.say(bob, 'grant', { kind: 'agent', scope: { acts: ['transfer'], parties: [ann.id], limit: M(1000), until: LATER } }, { to: bot.id })
  const byBot = s.say(bot, 'transfer', { money: M(300) }, { to_owner: ann.id, for: sale.hash, under: grant.hash })
  gives('an agent paying under her grant gives her money, not its own', byBot, bob, s.held, [line('money', ann, null, { minor: 300, currency: 'GBP' })], [32])
  gives('and none of the agent\'s', byBot, bot, s.held, [])
  const give = s.say(ann, 'transfer', {}, { what: ma.hash, to_owner: bob.id })
  gives('a thing handed over, a kind she names, to the receiver as goods', give, ann, s.held, [line('goods', bob, null, { what: ma.hash })])
  const loaf = s.say(ann, 'thing', { name: 'a loaf' }, { of: ma.hash })
  const stolen = s.say(bob, 'transfer', {}, { what: loaf.hash, to_owner: bob.id })
  gives('a loaf another person made is not Bob\'s to give: the record shows the maker owns it', stolen, bob, s.held, [])
}
{
  // a deal names one act: a set of ids there is refused
  const AUTH = '1'.repeat(64), ONE = '2'.repeat(64), TWO = '3'.repeat(64)
  kit.check('act: a deal names one act, never a set', { type: 'promise', state: { what: 'x' }, refs: { from: AUTH, act: [ONE, TWO] } }, ['grammar'], [], { invariants: [32] })
}

vectorsFile.save(V, tags)
console.log(`${kit.made.size} cases written to ${require('path').relative(process.cwd(), vectorsFile.FILE)}`)
