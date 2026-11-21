// Adds to spec/vectors.json the cases of `gives` (what of a person's becomes whose if a block stands: promises.md, What becomes whose)
// and of A name is pencil (promises.md): a name for a deal is a reading, its reader's own, and no field of a block. `node
// test/make-vectors-gives.cjs`, after `node scripts/build-wasm.cjs`. Idempotent. Each expectation is written by hand from the spec
// text; the Rust core must give it and so must the oracle (spec/oracle).
const vectorsFile = require('./vectors-file.cjs')
const { V, tags } = vectorsFile.load()
const kit = require('./vectors-kit.cjs')(V)
const { story, door, stage, LATER, M } = kit

const gives = (name, block, who, held, lines, invariants) => door(`gives: ${name}`, 'gives', [block, who.id, held], { expect: { gives: lines }, exact: true, invariants })
const line = (of, to, back, parts) => ({ of, ...parts, to: to === null ? null : to.id, back })
const HOUR = (n) => ({ value: String(n), unit: 'h' })
const PER_HOUR = { money: M(1500), per: HOUR(1) }
const accept = (s, who, offer, quantity) => s.say(who, 'promise', { status: 'accepted', ...(quantity ? { terms: { quantity } } : {}) }, { answers: offer.hash, for: offer.hash, after: [offer.hash] })

{
  // renting a kitchen by the hour: what a deal is, is what its blocks say
  const s = story(), owner = s.person('ac-owner'), renter = s.person('ac-renter')
  const kitchen = s.say(owner, 'thing', { kind: 'kitchen' }, {})
  const bench = s.say(owner, 'thing', { name: 'the shared kitchen' }, { of: kitchen.hash })
  const terms = { price: PER_HOUR, quantity: { min: HOUR(1), max: HOUR(8) }, until: LATER }
  const deal = s.say(owner, 'promise', { what: 'kitchen by the hour', terms }, { from: owner.id, to: renter.id, what: bench.hash })
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
  // a device's work by the square metre, and a device she owns, lent until a date
  const s = story(), mower = s.person('dv-mower', { kind: 'agent' }), customer = s.person('dv-customer')
  const deal = s.say(mower, 'promise', { what: 'mow the lawn', terms: { price: { money: M(20), per: { value: '10', unit: 'm2' } }, quantity: { value: '200', unit: 'm2' } } }, { from: mower.id, to: customer.id })
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
  // a schema whose words say "free" on a deal whose terms carry a price: gives reads the terms, never a schema's words (invariant 32)
  const s = story(), cafe = s.person('fr-cafe'), guest = s.person('fr-guest')
  const words = s.say(cafe, 'thing', { kind: 'schema', name: 'Free tasting', target: 'promise', labels: { en: { name: 'Free tasting: no charge, nothing to pay, nothing leaves you' } } }, {})
  const deal = s.say(cafe, 'promise', { what: 'a tasting', terms: { price: M(500), quantity: { value: '1', unit: 'tasting' } } }, { from: cafe.id, to: guest.id, schema: words.hash })
  gives('gives shows the money the terms move, not the words: £5 leaves the guest', deal, guest, s.held, [line('money', cafe, null, { minor: 500, currency: 'GBP' })], [32])
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
  const grant = s.say(bob, 'grant', { kind: 'agent', scope: { types: ['transfer'], parties: [ann.id], limit: M(1000), until: LATER } }, { to: bot.id })
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
  // A name is pencil (promises.md): no field of a block states a name for a deal, and a person's own signed name for one changes nothing
  const AUTH = '1'.repeat(64), ONE = '2'.repeat(64)
  kit.check('a name is pencil: a promise that carries a name in a ref key no schema declares is refused', { type: 'promise', state: { what: 'x' }, refs: { from: AUTH, act: ONE } }, ['undeclared_ref'])
  const s = story(), maria = s.person('nm-maria'), leila = s.person('nm-leila')
  const crates = s.say(leila, 'thing', { kind: 'crate of tomatoes' }, {})
  const offer = s.say(leila, 'promise', { what: 'twelve crates', terms: { price: M(6000), quantity: { value: '12', unit: 'crate' } } }, { from: leila.id, to: maria.id, what: crates.hash })
  const yes = accept(s, maria, offer)
  const before = stage('a name is pencil: the deal before either side names it', offer, s.held)
  const hers = s.say(maria, 'observe', { kind: 'name', text: 'Buying to sell on' }, { subject: offer.hash })
  const his = s.say(leila, 'observe', { kind: 'name', text: 'Selling and buying in bulk' }, { subject: offer.hash })
  door('a name is pencil: her own signed name for the deal is a sound block', 'valid', [hers, s.held.filter((b) => b.hash !== hers.hash), null], { expect: [], exact: true })
  door('a name is pencil: each side names the deal her own way, and its stage is the same', 'promise_stage', [offer, s.held, {}], { expect: before, exact: true })
  void yes; void his
}

vectorsFile.save(V, tags)
console.log(`${kit.made.size} cases written to ${require('path').relative(process.cwd(), vectorsFile.FILE)}`)
