// Stage 3 of FoodBlock 1.8, amounts (changes-1.8/03-amounts.md): its stories of things, parts and makes as signed worlds both
// engines can be run on (section 5, stories 1 to 11, 18, 21, 22; section 6, vectors 1 to 16, 29 to 36). Each question names a door
// op, its arguments (`held`: the blocks held when it was asked), `expect` (what the spec text says, with `text`, the sentence it says
// it in) and `core` (what the Rust core answered). Run alone (`node test/audit/k3-amounts.cjs`) it prints every question and each
// place the core differs from the text; `require` it for `{ worlds, questions }`.
const L = require('./k3-lib.cjs')
const { World, fb, kindOf, amt, put, signed, pairOf, secondKey, thing, give, yes, no, deal, ownersView, ownerView, owners, drawView, D, sums, waitingView, codes } = L

const questions = []
const ask = L.makeAsk(questions)
const kg = (n) => amt(n, 'kg')

// ---- 1. A sack split into ten bags (story 1) ----
{
  const w = new World('k3 a sack split into ten bags')
  const harry = w.person('harry'), maria = w.person('maria'), sam = w.person('sam')
  const sack = thing(w, harry, 'maize', kg(50), 'harry\'s 50 kg sack')
  const make = put(w, harry, 'transform', {}, { derives_from: [sack.hash] }, 'harry\'s make, taking the sack whole')
  const bags = [...Array(10)].map((_, i) => put(w, harry, 'thing', { kind: 'bag of maize', pack: kg(5) }, { derives_from: [make.hash] }, `bag ${i + 1}`))
  ask(w, 'split', 'the sack after the make', 'ownership', [sack, 'held', null], { owners: [], ended: '50' },
    'things.md, A make: A make with no output ends what it took; 03-amounts story 1: Sack: ended 50, owners none',
    (o) => (o.not_shown ? o : { owners: ownersView(w)(o), ended: L.v(o.ended) }))
  ask(w, 'split', 'bag 2: Harry owns its 5 kg', 'ownership', [bags[1], 'held', null], owners([harry, '5']),
    'things.md, A make: where the makes took from one owner, she owns it all; story 1: Each bag: Harry 5 kg', ownersView(w))
  const order = deal(w, harry, maria, bags[0], { quantity: kg(5) }, 'maria\'s order of bag 1')
  const sale = give(w, harry, bags[0], maria, null, 'harry sells bag 1 inside maria\'s order', { for: order.offer.hash, after: [order.accept.hash] })
  ask(w, 'split', 'bag 1 sold inside her order: lands at once', 'ownership', [bags[0], 'held', null], { owners: owners([maria, '5']), draw: D(true, null, 'landed') },
    'folds.md, What is left, Lands: her yes (her binding accept of the deal the draw is `for`, in the draw\'s own past)',
    (o) => (o.not_shown ? o : { owners: ownersView(w)(o), draw: drawView(sale.hash)(o) }))
  ask(w, 'split', 'made_from(sack): the ten bags', 'made_from', [sack, 'held'], bags.map((b) => ({ thing: b.hash, from: sack.hash, make: make.hash, took: null })).sort((a, b) => (a.thing < b.thing ? -1 : 1)),
    'folds.md, What each fold returns: made_from ... each thing written as an output of a counted make that took from it (took the amount, null for all), sorted by thing then make',
    (r) => r.map((x) => ({ thing: x.thing, from: x.from, make: x.make, took: L.v(x.took) })))
  // With no bag ids: ten transfers of 5 kg from the sack, no make.
  const sack2 = thing(w, harry, 'maize', kg(50), 'a second 50 kg sack')
  const ts = [...Array(10)].map((_, i) => {
    const to = i % 2 ? sam : maria
    const t = give(w, harry, sack2, to, kg(5), `5 kg of sack 2 to ${to.label} (${i + 1})`)
    yes(w, to, t, `${to.label} accepts ${i + 1}`)
    return t
  })
  ask(w, 'split', 'ten transfers of 5 kg, no make: Maria 25, Sam 25', 'ownership', [sack2, 'held', null], owners([maria, '25'], [sam, '25']),
    'things.md, Parts: A transfer with state.amount hands on that amount and the rest stays where it was; encoding.md: amounts of one measure are added', ownersView(w))
  const eleventh = give(w, harry, sack2, sam, kg(5), 'an eleventh 5 kg: nothing left')
  ask(w, 'split', 'an eleventh 5 kg', 'ownership', [sack2, 'held', null], D(false, 'past', null), 'folds.md, What is left: A draw that does not fit takes nothing and is never cut down to what is left', drawView(eleventh.hash))
  void ts
}

// ---- 2. 200 g from a 1 kg bag (story 2, vector 3) ----
{
  const w = new World('k3 200 g from a 1 kg bag')
  const maria = w.person('maria'), amara = w.person('amara')
  const bag = thing(w, maria, 'flour', kg(1), 'maria\'s 1 kg bag')
  const make = put(w, maria, 'transform', { inputs: [{ from: bag.hash, amount: kg('0.2') }] }, { derives_from: [bag.hash] }, 'her make takes 0.2 kg')
  const loaf = put(w, maria, 'thing', { kind: 'loaf' }, { derives_from: [make.hash] }, 'the loaf')
  ask(w, '200 g', 'the make\'s draw of 0.2 kg', 'ownership', [bag, 'held', null], D(true, null, 'landed'),
    'folds.md, What is left: a make naming it in state.inputs is a draw; Lands: A draw that names no receiver lands where it stands', drawView(make.hash))
  ask(w, '200 g', 'the bag: Maria 0.8, ended 0.2', 'ownership', [bag, 'held', null], { owners: owners([maria, '0.8']), ended: '0.2' },
    'story 2: takes; the loaf is hers; bag Maria 0.8', (o) => (o.not_shown ? o : { owners: ownersView(w)(o), ended: L.v(o.ended) }))
  ask(w, '200 g', 'the loaf is hers', 'ownership', [loaf, 'held', null], 'maria', 'things.md, A make: where the makes took from one owner, she owns it all', ownerView(w))
  const grams = put(w, maria, 'transform', { inputs: [{ from: bag.hash, amount: amt('200', 'g') }] }, { derives_from: [bag.hash] }, 'a make of 200 g')
  const loaf2 = put(w, maria, 'thing', { kind: 'loaf' }, { derives_from: [grams.hash] }, 'its loaf')
  ask(w, '200 g', 'the 200 g make: another unit', 'ownership', [bag, 'held', null], D(false, 'unit', null), 'folds.md, What is left, One whole: Nothing is converted: an amount of another kind than the measure takes nothing (unit)', drawView(grams.hash))
  ask(w, '200 g', 'its loaf has no owner', 'ownership', [loaf2, 'held', null], [],
    'UNCLEAR: story 2 says the loaf has no owner; things.md A make says only a make by a non-owner has an ownerless output, and is silent on an output of an owner\'s make that took nothing', ownersView(w))
  const t9 = give(w, maria, bag, amara, kg('0.9'), '0.9 kg to amara')
  ask(w, '200 g', '0.9 kg to Amara', 'ownership', [bag, 'held', null], D(false, 'past', null), 'story 2: Then 0.9 kg to Amara: past', drawView(t9.hash))
  const t8 = give(w, maria, bag, amara, kg('0.8'), '0.8 kg to amara')
  ask(w, '200 g', '0.8 kg to Amara, before her yes', 'ownership', [bag, 'held', null], { owners: [], held: '0.8', ended: '0.2', draw: D(true, null, 'held') },
    'UNCLEAR: folds.md, Lands: Nothing fills her silence: until her yes, no one is shown owning what is held (read here as: Maria is not listed for the held 0.8 either)',
    (o) => (o.not_shown ? o : { owners: ownersView(w)(o), held: L.v(o.held), ended: L.v(o.ended), draw: drawView(t8.hash)(o) }))
  yes(w, amara, t8, 'amara accepts')
  ask(w, '200 g', 'after Amara\'s yes: Amara 0.8, ended 0.2', 'ownership', [bag, 'held', null], { owners: owners([amara, '0.8']), owner: 'amara', held: '0', ended: '0.2' },
    'story 2: then bag Amara 0.8, ended 0.2; folds.md: owner the one id that owns all of it when nothing is held',
    (o) => (o.not_shown ? o : { owners: ownersView(w)(o), owner: ownerView(w)(o), held: L.v(o.held), ended: L.v(o.ended) }))
}

// ---- 3. 0.6 kg and 0.6 kg from a 1 kg sack, then all he owns (story 3, vectors 1, 2) ----
{
  const w = new World('k3 0.6 and 0.6 from a 1 kg sack')
  const harry = w.person('harry'), maria = w.person('maria'), amara = w.person('amara'), sam = w.person('sam')
  const sack = thing(w, harry, 'flour', kg(1), 'harry\'s 1 kg sack')
  const toMaria = give(w, harry, sack, maria, kg('0.6'), '0.6 kg to maria')
  ask(w, '0.6 twice', 'the draw to Maria holds before her yes', 'ownership', [sack, 'held', null], D(true, null, 'held'), 'folds.md, What is left, Holds: From where it is signed on the line, a draw\'s amount is out of what its owner may draw on', drawView(toMaria.hash))
  yes(w, maria, toMaria, 'maria accepts')
  const amaraDeal = deal(w, harry, amara, sack, { quantity: kg('0.6'), price: amt('1', 'GBP') }, 'amara\'s deal')
  const pay = put(w, amara, 'transfer', { amount: amt('1', 'GBP') }, { to_owner: harry.id, for: amaraDeal.offer.hash }, 'amara pays £1')
  yes(w, harry, pay, 'harry accepts the £1')
  const toAmara = give(w, harry, sack, amara, kg('0.6'), '0.6 kg to amara', { for: amaraDeal.offer.hash, after: [amaraDeal.accept.hash] })
  yes(w, amara, toAmara, 'amara accepts the 0.6 kg')
  ask(w, '0.6 twice', 'vector 1: Maria landed, Amara past, Harry 0.4, Maria 0.6', 'ownership', [sack, 'held', null],
    { owners: owners([harry, '0.4'], [maria, '0.6']), maria: D(true, null, 'landed'), amara: D(false, 'past', null) },
    '03-amounts vector 1: Maria 0.6 landed, Amara past, owners Harry 0.4, Maria 0.6',
    (o) => (o.not_shown ? o : { owners: ownersView(w)(o), maria: drawView(toMaria.hash)(o), amara: drawView(toAmara.hash)(o) }))
  ask(w, '0.6 twice', 'Amara\'s £1 is uncovered', 'promise_stage', [amaraDeal.offer, 'held', {}], { stage: 'underway', to: '1' },
    'folds.md, What each fold returns, uncovered: to (the paying side) is an amount in the price\'s kind: what she paid, less transfers back, less the price of what moved to her; story 3: her £1 is uncovered.to £1',
    (s) => (s.not_shown ? s : { stage: s.stage, to: L.v(s.uncovered && s.uncovered.to) }))
  const all = give(w, harry, sack, sam, null, 'all he owns of it to sam')
  yes(w, sam, all, 'sam accepts')
  ask(w, '0.6 twice', 'vector 2: all he owns to Sam takes 0.4', 'ownership', [sack, 'held', null], { owners: owners([maria, '0.6'], [sam, '0.4']), draw: D(true, null, 'landed') },
    'folds.md, What is left, A draw: takes ... all she owns of it when it states none; story 3: Sack: Maria 0.6, Sam 0.4',
    (o) => (o.not_shown ? o : { owners: ownersView(w)(o), draw: drawView(all.hash)(o) }))
  ask(w, '0.6 twice', 'the draw of all lists amount null', 'ownership', [sack, 'held', null], null, 'folds.md, What is left: amount what it states (null for all)', (o) => o.draws.find((x) => x.block === all.hash).amount)
}

// ---- 4. A baked sack, then sold (story 4, vector 4) ----
{
  const w = new World('k3 a baked sack then sold')
  const harry = w.person('harry'), sam = w.person('sam')
  const sack = thing(w, harry, 'flour', kg(1), 'harry\'s sack')
  const make = put(w, harry, 'transform', {}, { derives_from: [sack.hash] }, 'harry bakes the sack whole')
  const loaf = put(w, harry, 'thing', { kind: 'loaf' }, { derives_from: [make.hash] }, 'his loaf')
  const sale = give(w, harry, sack, sam, null, 'harry sells the sack to sam')
  yes(w, sam, sale, 'sam accepts')
  ask(w, 'baked then sold', 'the sale of the baked sack', 'ownership', [sack, 'held', null], { owners: [], draw: D(false, 'past', null) },
    'folds.md, What is left: where she owned some and it does not fit, past; story 4: he owns none of it, past',
    (o) => (o.not_shown ? o : { owners: ownersView(w)(o), draw: drawView(sale.hash)(o) }))
  ask(w, 'baked then sold', 'the loaf is Harry\'s', 'ownership', [loaf, 'held', null], 'harry', 'story 4: Sam owns nothing; the loaf is Harry\'s', ownerView(w))
}

// ---- 5. Bread from Maria's flour: by Harry with no grant, as toll work, by her own tool, by a stranger (story 5, vector 5) ----
{
  const w = new World('k3 bread from another\'s flour')
  const maria = w.person('maria'), harry = w.person('harry'), leila = w.person('leila'), oven = w.person('oven', 'machine')
  const flour = thing(w, maria, 'flour', kg(1), 'maria\'s 1 kg flour')
  const make = put(w, harry, 'transform', {}, { derives_from: [flour.hash] }, 'harry bakes her flour, no grant')
  const loaf = put(w, harry, 'thing', { kind: 'loaf' }, { derives_from: [make.hash] }, 'harry\'s loaf')
  ask(w, 'no grant', 'Harry\'s make of her flour', 'ownership', [flour, 'held', null], { owners: owners([maria, '1']), draw: D(false, 'not_owner', null) },
    'things.md, A make: Only an owner ends her own stuff: a make by anyone else takes nothing (not_owner)',
    (o) => (o.not_shown ? o : { owners: ownersView(w)(o), draw: drawView(make.hash)(o) }))
  ask(w, 'no grant', 'vector 5: loaf owners []', 'ownership', [loaf, 'held', null], [], 'things.md, A make: and its output has no owner', ownersView(w))
  // Toll work: her grant naming the flour, limit 0.5 kg (stage 4 writes how the part passes).
  const flour2 = thing(w, maria, 'flour', kg(1), 'maria\'s second 1 kg flour')
  const toll = put(w, maria, 'grant', { kind: 'tool', scope: { limit: kg('0.5') } }, { to: harry.id, what: flour2.hash }, 'maria\'s toll grant to harry, 0.5 kg of the flour')
  yes(w, harry, toll, 'harry accepts the grant')
  const tollMake = put(w, harry, 'transform', { inputs: [{ from: flour2.hash, amount: kg('0.5') }] }, { derives_from: [flour2.hash], under: toll.hash }, 'harry bakes 0.5 kg under her grant')
  const tollLoaf = put(w, harry, 'thing', { kind: 'loaf' }, { derives_from: [tollMake.hash] }, 'the toll loaf')
  ask(w, 'toll', 'the toll make takes 0.5 kg', 'ownership', [flour2, 'held', null], { takes: true, why: null },
    'UNCLEAR: 03-amounts story 5 (his make under it takes 0.5 kg); how a grant naming an instance passes the part is stage 4\'s, so the draw\'s state is not asked',
    (o) => { const d = drawView(tollMake.hash)(o); return d.takes === undefined ? d : { takes: d.takes, why: d.why } })
  ask(w, 'toll', 'the toll loaf, before her answer: nobody\'s', 'ownership', [tollLoaf, 'held', null], [], 'folds.md, What is left, Her start, case 2: the output is hers from her accepted answer to it ... Until her start, no one is shown owning the output', ownersView(w))
  put(w, maria, 'thing', { status: 'accepted' }, { answers: tollLoaf.hash }, 'maria answers the toll loaf accepted')
  ask(w, 'toll', 'the toll loaf, after her accepted answer: hers', 'ownership', [tollLoaf, 'held', null], 'maria',
    'UNCLEAR: case 2 says her accepted answer "to it" (the make) and story 5 says an answer that "names it" (the loaf); an accept is written with the type of the block it answers (core.md 2), so here a thing answering the loaf', ownerView(w))
  // Her own tool under her grant: case 1.
  const flour3 = thing(w, maria, 'flour', kg(1), 'maria\'s third flour')
  const tool = put(w, maria, 'grant', { kind: 'tool', scope: { types: ['transform'] } }, { to: oven.id, what: flour3.hash }, 'maria\'s grant to her oven')
  yes(w, oven, tool, 'the oven accepts')
  const ovenMake = put(w, oven, 'transform', {}, { derives_from: [flour3.hash], under: tool.hash }, 'the oven bakes her flour under her grant')
  const ovenLoaf = put(w, oven, 'thing', { kind: 'loaf' }, { derives_from: [ovenMake.hash] }, 'the oven\'s loaf')
  ask(w, 'her tool', 'her tool\'s make: the loaf is hers from that block', 'ownership', [ovenLoaf, 'held', null], 'maria',
    'UNCLEAR: folds.md, Her start, case 1: a make signed by a tool of hers under her grant so that it binds her ... hers from that block; whether this grant (no scope.on, no meter) makes the make bind her is stage 4\'s', ownerView(w))
  // A stranger's make naming her inputs: case 3.
  const flour4 = thing(w, maria, 'flour', kg(1), 'maria\'s fourth flour')
  const sMake = put(w, leila, 'transform', {}, { derives_from: [flour4.hash] }, 'leila, a stranger, writes a make of maria\'s flour')
  const sLoaf = put(w, leila, 'thing', { kind: 'loaf' }, { derives_from: [sMake.hash] }, 'leila\'s loaf')
  ask(w, 'stranger', 'the stranger\'s make takes nothing', 'ownership', [flour4, 'held', null], { owners: owners([maria, '1']), draw: D(false, 'not_owner', null) },
    'things.md, A make: a make by anyone else takes nothing (not_owner)', (o) => (o.not_shown ? o : { owners: ownersView(w)(o), draw: drawView(sMake.hash)(o) }))
  ask(w, 'stranger', 'nothing is hers', 'ownership', [sLoaf, 'held', null], [], 'folds.md, Her start, case 3: A stranger\'s word never starts her line', ownersView(w))
  put(w, maria, 'thing', { status: 'accepted' }, { answers: sLoaf.hash }, 'maria answers the stranger\'s loaf accepted')
  ask(w, 'stranger', 'after her own accepted answer', 'ownership', [sLoaf, 'held', null], 'maria',
    'UNCLEAR: folds.md, Her start, case 3: nothing is hers on the record until she herself answers accepted (so after it, hers); things.md, A make says its output has no owner', ownerView(w))
}

// ---- 6. Three owners' flour in one silo (story 6, vector 6) ----
function silo(name, pack) {
  const w = new World(name)
  const harry = w.person('harry'), sam = w.person('sam'), maria = w.person('maria'), mill = w.person('mill'), amara = w.person('amara')
  const lots = [[harry, '300'], [sam, '500'], [maria, '200']].map(([p, n]) => [p, thing(w, p, 'wheat flour', kg(n), `${p.label}'s ${n} kg`)])
  const makes = lots.map(([p, lot]) => {
    const g = put(w, p, 'grant', { kind: 'tool', scope: { types: ['transform'] } }, { to: mill.id, what: lot.hash }, `${p.label}'s grant to the mill`)
    yes(w, mill, g, `the mill accepts ${p.label}'s grant`)
    return put(w, mill, 'transform', {}, { derives_from: [lot.hash], under: g.hash }, `the mill's make of ${p.label}'s flour`)
  })
  const s = put(w, mill, 'thing', { kind: 'silo', pack: kg(pack) }, { of: kindOf('wheat flour'), derives_from: makes.map((m) => m.hash) }, `the silo, ${pack} kg`)
  return { w, harry, sam, maria, mill, amara, s }
}
{
  const { w, harry, sam, maria, mill, amara, s } = silo('k3 three owners in one silo', '1000')
  ask(w, 'silo', 'before any accepted answer: no owners', 'ownership', [s, 'held', null], [], 'folds.md, Her start, case 2; story 6: Each is shown as an owner once her accepted answer to the silo ... is held', ownersView(w))
  put(w, harry, 'thing', { status: 'accepted' }, { answers: s.hash }, 'harry accepts the silo')
  ask(w, 'silo', 'after Harry\'s answer: Harry 300 only', 'ownership', [s, 'held', null], owners([harry, '300']),
    'folds.md, What each fold returns: an owner whose start is her accepted answer listed only once it is held', ownersView(w))
  put(w, sam, 'thing', { status: 'accepted' }, { answers: s.hash }, 'sam accepts the silo')
  put(w, maria, 'thing', { status: 'accepted' }, { answers: s.hash }, 'maria accepts the silo')
  ask(w, 'silo', 'all three: 300 + 500 + 200 = 1000', 'ownership', [s, 'held', null], owners([harry, '300'], [maria, '200'], [sam, '500']),
    'things.md, A make: from several, each owns in it the amount taken from her when its pack is the sum of what was taken, in one kind', ownersView(w))
  const sMake = put(w, sam, 'transform', { inputs: [{ from: s.hash, amount: kg(100) }] }, { derives_from: [s.hash] }, 'sam draws 100 kg into flour')
  const hSale = give(w, harry, s, amara, kg(300), 'harry sells 300 kg to amara')
  const hMore = give(w, harry, s, amara, kg(1), 'harry, 1 kg more')
  const mMake = put(w, mill, 'transform', { inputs: [{ from: s.hash, amount: kg(10) }] }, { derives_from: [s.hash] }, 'the mill draws the silo for itself')
  const dv = (o) => (o.not_shown ? o : { sam: drawView(sMake.hash)(o), harry: drawView(hSale.hash)(o), more: drawView(hMore.hash)(o), mill: drawView(mMake.hash)(o) })
  ask(w, 'silo', 'Sam 100 takes; Harry 300 takes; Harry 1 more past; the mill not_owner', 'ownership', [s, 'held', null],
    { sam: D(true, null, 'landed'), harry: D(true, null, 'held'), more: D(false, 'past', null), mill: D(false, 'not_owner', null) },
    'story 6: Sam draws 100 kg into flour: takes. Harry sells 300 to Amara: takes. Harry 1 kg more: past. The mill draws the silo for itself: not_owner', dv)
}
{
  const { w, harry, sam, maria, amara, s } = silo('k3 a silo of 790 kg', '790')
  for (const p of [harry, sam, maria]) put(w, p, 'thing', { status: 'accepted' }, { answers: s.hash }, `${p.label} accepts the silo`)
  ask(w, 'silo 790', 'pack 790: owners named with no amount', 'ownership', [s, 'held', null], owners([harry, null], [maria, null], [sam, null]),
    'things.md, A make: otherwise each is named with no amount and hands on only all she owns of it', ownersView(w))
  const part = give(w, harry, s, amara, kg(100), 'harry draws 100 kg')
  ask(w, 'silo 790', 'a draw of an amount: no_measure', 'ownership', [s, 'held', null], D(false, 'no_measure', null),
    'protocol.json no_measure: an amount drawn on a thing that states no pack, or where the drawer\'s amount of it is not said (an output of unlike inputs)', drawView(part.hash))
  const all = give(w, harry, s, amara, null, 'harry hands on all he owns of it')
  ask(w, 'silo 790', 'all she owns: takes', 'ownership', [s, 'held', null], D(true, null, 'held'), 'things.md, A make: hands on only all she owns of it', drawView(all.hash))
}

// ---- 7. A carcass cut into parts (story 7, vector 7) ----
{
  const w = new World('k3 a carcass cut into parts')
  const leila = w.person('leila'), sam = w.person('sam'), amara = w.person('amara')
  const steer = thing(w, leila, 'steer', kg(400), 'leila\'s steer, 400 kg')
  const g = put(w, leila, 'grant', { kind: 'tool', scope: { types: ['transform'] } }, { to: sam.id, what: steer.hash }, 'leila\'s grant to sam\'s abattoir')
  yes(w, sam, g, 'sam accepts')
  const cut = put(w, sam, 'transform', {}, { derives_from: [steer.hash], under: g.hash }, 'sam cuts the steer under her grant')
  const parts = [['side A', 140], ['side B', 140], ['offal', 60], ['hide', 60]].map(([word, n]) => put(w, sam, 'thing', { kind: word, pack: kg(n) }, { derives_from: [cut.hash] }, word))
  ask(w, 'carcass', 'side A before her accept: nobody\'s', 'ownership', [parts[0], 'held', null], [], 'folds.md, Her start, case 2 (an abattoir)', ownersView(w))
  for (const p of parts) put(w, leila, 'thing', { status: 'accepted' }, { answers: p.hash }, `leila accepts ${p.state.kind}`)
  ask(w, 'carcass', 'each part Leila\'s once she accepts', 'ownership', [parts[3], 'held', null], owners([leila, '60']), '03-amounts vector 7: four outputs, Leila\'s once she ... accepts each', ownersView(w))
  ask(w, 'carcass', 'the steer is ended', 'ownership', [steer, 'held', null], { owners: [], ended: '400' }, 'folds.md, What is left: what a make took is ended', (o) => (o.not_shown ? o : { owners: ownersView(w)(o), ended: L.v(o.ended) }))
  const sale = give(w, leila, parts[0], amara, kg(40), 'leila sells 40 kg of side A to amara')
  yes(w, amara, sale, 'amara accepts')
  ask(w, 'carcass', 'side A: Amara 40, Leila 100', 'ownership', [parts[0], 'held', null], owners([amara, '40'], [leila, '100']), 'story 7: She sells 40 kg of side A to Amara: Amara 40, Leila 100', ownersView(w))
  const steer2 = thing(w, leila, 'steer', kg(400), 'a second steer')
  const cut2 = put(w, sam, 'transform', {}, { derives_from: [steer2.hash] }, 'sam cuts it with no grant')
  const sideC = put(w, sam, 'thing', { kind: 'side C', pack: kg(140) }, { derives_from: [cut2.hash] }, 'side C')
  ask(w, 'carcass', 'no grant: the steer stays whole and Leila\'s', 'ownership', [steer2, 'held', null], { owners: owners([leila, '400']), draw: D(false, 'not_owner', null) },
    'story 7: With no grant: Sam\'s cut is not_owner, the steer stays whole and Leila\'s', (o) => (o.not_shown ? o : { owners: ownersView(w)(o), draw: drawView(cut2.hash)(o) }))
  ask(w, 'carcass', 'side C has no owner', 'ownership', [sideC, 'held', null], [], 'story 7: his side C has no owner', ownersView(w))
}

// ---- 8. An unweighed pile sold for cash (story 8, vector 15) ----
{
  const w = new World('k3 an unweighed pile')
  const mama = w.person('mama'), leila = w.person('leila'), sam = w.person('sam')
  const pile = thing(w, mama, 'maize', null, 'mama\'s pile, no pack')
  const order = deal(w, mama, leila, kindOf('maize'), { quantity: kg(2), price: amt('100', 'KES') }, 'leila\'s order of 2 kg of maize')
  const two = give(w, mama, pile, leila, kg(2), 'mama\'s 2 kg, naming the pile', { for: order.offer.hash, after: [order.accept.hash] })
  ask(w, 'pile', 'the 2 kg named on the pile: no_measure', 'ownership', [pile, 'held', null], { owners: owners([mama, null]), draw: D(false, 'no_measure', null) },
    'folds.md, One whole: An amount drawn on it takes nothing of it (no_measure) and is read as a transfer that names no instance',
    (o) => (o.not_shown ? o : { owners: ownersView(w)(o), draw: drawView(two.hash)(o) }))
  ask(w, 'pile', 'before her answer to the transfer it counts nothing (her order says what she wants, not that it came)', 'promise_stage', [order.offer, 'held', {}], '0',
    'things.md, Transfers: one that names none counts toward its line only on the receiver\'s accept (03-amounts, What building changed: cash counts on her accepted answer, or her received word)',
    (s) => (s.not_shown ? s : L.v(s.lines[0].moved)))
  yes(w, leila, two, 'leila accepts the 2 kg')
  const pay = put(w, leila, 'transfer', { amount: amt('100', 'KES') }, { to_owner: mama.id, for: order.offer.hash }, 'leila pays 100 shillings')
  yes(w, mama, pay, 'mama accepts, covers 100 KES', { covers: amt('100', 'KES') })
  ask(w, 'pile', 'the deal is done: 2 kg moved, 100 paid', 'promise_stage', [order.offer, 'held', {}], { stage: 'done', moved: '2', paid: '100' },
    'folds.md, A promise\'s stage 2: one that names none, in the line\'s kind, on the receiver\'s accept',
    (s) => (s.not_shown ? s : { stage: s.stage, moved: L.v(s.lines[0].moved), paid: L.v(s.paid) }))
  const whole = give(w, mama, pile, sam, null, 'the whole pile to sam')
  yes(w, sam, whole, 'sam accepts')
  ask(w, 'pile', 'the whole pile, no amount: Sam owns it', 'ownership', [pile, 'held', null], 'sam', 'story 8: The whole pile, no amount, to Sam: takes; Sam owns the pile', ownerView(w))
}

// ---- 9. A stranger names Harry's sack in refs.of (story 9, vector 8) ----
{
  const w = new World('k3 a stranger names the sack in refs.of')
  const harry = w.person('harry'), leila = w.person('leila'), amara = w.person('amara')
  const sack = thing(w, harry, 'maize', kg(50), 'harry\'s sack')
  const hers = put(w, leila, 'thing', { kind: 'a sack of harry\'s' }, { of: sack.hash }, 'leila\'s thing, refs.of the sack')
  ask(w, 'stranger of', 'the sack is still Harry\'s', 'ownership', [sack, 'held', null], 'harry', 'things.md: a stranger\'s thing that names an instance in refs.of says nothing about that instance', ownerView(w))
  ask(w, 'stranger of', 'Leila\'s thing is hers', 'ownership', [hers, 'held', null], 'leila', 'story 9: Leila\'s thing is an instance ... by its own block, owner Leila', ownerView(w))
  const sale = give(w, harry, sack, amara, null, 'harry sells the sack to amara')
  yes(w, amara, sale, 'amara accepts')
  ask(w, 'stranger of', 'sold to Amara', 'ownership', [sack, 'held', null], 'amara', 'story 9: He sells the sack to Amara: Amara', ownerView(w))
}

// ---- 10. The millstone to a silent receiver, then to another (story 10, vectors 9, 10) ----
{
  const w = new World('k3 the millstone to a silent receiver')
  const harry = w.person('harry'), maria = w.person('maria'), sam = w.person('sam')
  const stone = thing(w, harry, 'millstone', null, 'harry\'s millstone, one whole')
  const toMaria = give(w, harry, stone, maria, null, 'the stone to maria; she says nothing')
  const toSam = give(w, harry, stone, sam, null, 'the stone to sam')
  ask(w, 'millstone', 'held for Maria; Sam past from the first minute; nobody shown owning it', 'ownership', [stone, 'held', null],
    { owners: [], owner: null, maria: D(true, null, 'held'), sam: D(false, 'past', null) },
    'folds.md, Lands: until her yes, no one is shown owning what is held; story 10: He signs it to Sam: past from the first minute',
    (o) => (o.not_shown ? o : { owners: ownersView(w)(o), owner: o.owner, maria: drawView(toMaria.hash)(o), sam: drawView(toSam.hash)(o) }))
  put(w, maria, 'transfer', { status: 'accepted' }, { answers: toMaria.hash }, 'maria\'s yes, citing nothing else')
  ask(w, 'millstone', 'Maria\'s yes lands it', 'ownership', [stone, 'held', null], { owner: 'maria', maria: D(true, null, 'landed'), sam: D(false, 'past', null) },
    '03-amounts vector 9: Sam past; Maria\'s later yes: landed', (o) => (o.not_shown ? o : { owner: ownerView(w)(o), maria: drawView(toMaria.hash)(o), sam: drawView(toSam.hash)(o) }))
}
{
  const w = new World('k3 the millstone ended before her yes')
  const harry = w.person('harry'), maria = w.person('maria'), sam = w.person('sam')
  const stone = thing(w, harry, 'millstone', null, 'harry\'s millstone')
  const toMaria = give(w, harry, stone, maria, null, 'the stone to maria')
  const end = put(w, harry, 'transfer', { status: 'stopped', stop: 'before' }, { updates: toMaria.hash }, 'harry ends his transfer')
  const early = give(w, harry, stone, sam, null, 'the stone to sam, before maria saw the end')
  ask(w, 'millstone ended', 'a draw counting on an end she has not seen: waiting on end', 'ownership', [stone, 'held', null], 'end',
    'folds.md, Freed: An end she has not seen frees nothing yet: a later draw counting on it is waiting (on: end)', waitingView(early.hash))
  const seen = put(w, maria, 'observe', { kind: 'note', text: 'saw it' }, { after: [end.hash] }, 'maria\'s next block has the end in its past')
  const later = give(w, harry, stone, sam, null, 'the stone to sam, with her block in its past', { after: [seen.hash] })
  ask(w, 'millstone ended', 'freed, his new draw with her block in its past takes', 'ownership', [stone, 'held', null], { maria: D(true, null, 'freed'), sam: D(true, null, 'held') },
    'folds.md, Freed: by an end of the draw that the receiver has seen before any yes ... for her later draws that have the freeing in their causal past',
    (o) => (o.not_shown ? o : { maria: drawView(toMaria.hash)(o), sam: drawView(later.hash)(o) }))
}

// ---- 10b. A transfer that states `expires`: read only against the receiver's own dated word (T15; Freed) ----
{
  const w = new World('k3 the millstone with expires')
  const harry = w.person('harry'), maria = w.person('maria'), sam = w.person('sam')
  const stone = thing(w, harry, 'millstone', null, 'harry\'s millstone')
  // its end is a time it states, between the transfer (a minute after the stone) and her accept (a minute after that)
  const exp = new Date(Date.parse(stone.state.at) + 90000).toISOString().replace(/\.\d+Z$/, '.000Z')
  const t = put(w, harry, 'transfer', { expires: exp }, { what: stone.hash, to_owner: maria.id }, 'the stone to maria, with expires')
  const late = yes(w, maria, t, 'maria accepts, dated after it expired')
  const later = give(w, harry, stone, sam, null, 'the stone to sam, with her late block in its past', { after: [late.hash] })
  ask(w, 'expires', 'her late accept is no yes and frees the stone; his draw to Sam with it in its past takes', 'ownership', [stone, 'held', null], { maria: D(true, null, 'freed'), sam: D(true, null, 'held') },
    'things.md, Transfers: state.expires is an end of it; folds.md, Freed: an end of a draw ... a time it states read only against the receiver\'s own dated word',
    (o) => (o.not_shown ? o : { maria: drawView(t.hash)(o), sam: drawView(later.hash)(o) }))
}

// ---- 11. A seller's second key line; a part passed to the till (story 11, vectors 11, 12) ----
{
  const w = new World('k3 a seller\'s second key line')
  const harry = w.person('harry'), maria = w.person('maria'), leila = w.person('leila'), sam = w.person('sam')
  const till = secondKey(w, harry, 'harry\'s till key')
  const stone = thing(w, harry, 'millstone', null, 'the stone')
  const s1 = give(w, harry, stone, maria, null, 'the phone sells the stone to maria')
  yes(w, maria, s1, 'maria accepts')
  const s2 = give(w, maria, stone, leila, null, 'maria resells to leila')
  yes(w, leila, s2, 'leila accepts')
  const tillSale = give(w, harry, stone, sam, null, 'the till, which never saw the sale, sells it to sam', {}, { key: till })
  ask(w, 'second key', 'the till\'s sale: not_on_line; owner Leila', 'ownership', [stone, 'held', null], { owner: 'leila', till: D(false, 'not_on_line', null) },
    'folds.md, Her start: A draw on it signed by any other key, hers or anyone\'s, takes nothing (not_on_line)', (o) => (o.not_shown ? o : { owner: ownerView(w)(o), till: drawView(tillSale.hash)(o) }))
  const trays = thing(w, harry, 'egg tray', amt(30, 'tray'), 'thirty trays')
  const pass = give(w, harry, trays, harry, amt(10, 'tray'), 'the phone passes 10 trays to the till (to_owner himself)')
  yes(w, harry, pass, 'the till accepts the 10', {}, {}, { key: till })
  const ten = give(w, harry, trays, sam, amt(10, 'tray'), 'the till sells 10', {}, { key: till })
  const eleventh = give(w, harry, trays, sam, amt(1, 'tray'), 'the till sells an 11th', {}, { key: till })
  ask(w, 'second key', 'vector 12: the till sells 10: takes; the 11th: past', 'ownership', [trays, 'held', null], { pass: D(true, null, 'landed'), ten: D(true, null, 'held'), eleventh: D(false, 'past', null) },
    'folds.md, Her start: Another key of hers, a till or a tool draws only on a part passed to its own line: a draw to_owner its own owner, which the accept of that key lands',
    (o) => (o.not_shown ? o : { pass: drawView(pass.hash)(o), ten: drawView(ten.hash)(o), eleventh: drawView(eleventh.hash)(o) }))
}

// ---- 12. Two accepts of one draw by two of her keys apart, and the one start (story 22, vectors 35, 36) ----
{
  const w = new World('k3 two accepts apart')
  const sam = w.person('sam'), maria = w.person('maria'), leila = w.person('leila'), ben = w.person('ben')
  const tablet = secondKey(w, maria, 'maria\'s tablet key')
  const sacks = thing(w, sam, 'maize', amt(10, 'sack'), 'sam\'s ten sacks')
  const t = give(w, sam, sacks, maria, null, 'sam signs the ten sacks to maria')
  const phoneYes = yes(w, maria, t, 'her phone accepts')
  const tabletYes = yes(w, maria, t, 'her tablet accepts, not seeing the phone', {}, {}, { key: tablet })
  const phoneSale = give(w, maria, sacks, leila, amt(2, 'sack'), 'her phone sells two')
  const tabletSale = give(w, maria, sacks, ben, amt(2, 'sack'), 'her tablet sells two', {}, { key: tablet })
  const onlyPhone = w.blocks.filter((b) => b.hash !== tabletYes.hash && b.hash !== tabletSale.hash)
  ask(w, 'two accepts', 'with only the phone\'s accept held: it is the start; its draw of 2 takes', 'ownership', [sacks, onlyPhone, null], { sam: D(true, null, 'landed'), phone: D(true, null, 'held') },
    'folds.md, One start: a reader holding one reads it as the start (vector 35)', (o) => (o.not_shown ? o : { sam: drawView(t.hash)(o), phone: drawView(phoneSale.hash)(o) }))
  ask(w, 'two accepts', 'both held: Maria owns the ten, on no line; each sale not_on_line; no pair', 'ownership', [sacks, 'held', null],
    { owners: owners([maria, '10']), sam: D(true, null, 'landed'), phone: D(false, 'not_on_line', null), tablet: D(false, 'not_on_line', null), pairs: 0 },
    'folds.md, One start: neither starts a line: the yes is given, so the amount is its receiver\'s ... but on no line, and every draw on it by either key takes nothing (not_on_line) ... lists no pair',
    (o) => (o.not_shown ? o : { owners: ownersView(w)(o), sam: drawView(t.hash)(o), phone: drawView(phoneSale.hash)(o), tablet: drawView(tabletSale.hash)(o), pairs: o.draws.filter((d) => d.why === 'pair').length }))
  const start = yes(w, maria, t, 'her phone accepts again, after naming both', {}, { after: [phoneYes.hash, tabletYes.hash] })
  const phoneSale2 = give(w, maria, sacks, leila, amt(2, 'sack'), 'her phone sells two more', { after: [start.hash] })
  const tabletSale2 = give(w, maria, sacks, ben, amt(2, 'sack'), 'her tablet sells two more', {}, { key: tablet })
  ask(w, 'two accepts', 'vector 36: the one start; the phone\'s next sale takes; the others stay not_on_line', 'ownership', [sacks, 'held', null],
    { phone: D(false, 'not_on_line', null), tablet: D(false, 'not_on_line', null), phone2: D(true, null, 'held'), tablet2: D(false, 'not_on_line', null) },
    'folds.md, One start: A later block of a key that may give that accept, whose after names both, is the one start',
    (o) => (o.not_shown ? o : { phone: drawView(phoneSale.hash)(o), tablet: drawView(tabletSale.hash)(o), phone2: drawView(phoneSale2.hash)(o), tablet2: drawView(tabletSale2.hash)(o) }))
}

// ---- 13. A pair on an owner's line (story 11's last case, vector 13) ----
{
  const w = new World('k3 a pair on an owner\'s line')
  const harry = w.person('harry'), maria = w.person('maria'), sam = w.person('sam'), amara = w.person('amara')
  const sack = thing(w, harry, 'maize', kg(10), 'harry\'s 10 kg sack')
  const [a, b] = pairOf(w, harry, harry.keys,
    ['transfer', { amount: kg(4) }, { what: sack.hash, to_owner: maria.id }, '4 kg to maria'],
    ['transfer', { amount: kg(4) }, { what: sack.hash, to_owner: sam.id }, '4 kg to sam, on the same prev'])
  const later = w.add(L.signed(harry, harry.keys, 'transfer', { amount: kg(1) }, { what: sack.hash, to_owner: amara.id }, { prev: a.hash, seq: a.state.seq + 1 }), 'a later 1 kg to amara')
  ask(w, 'pair', 'both draws pair; a later draw of that key pair', 'ownership', [sack, 'held', null], { a: D(false, 'pair', null), b: D(false, 'pair', null), later: D(false, 'pair', null) },
    'folds.md, A fork is a burden: where draws of a fork name one measure, none of them lands ... each later draw of that key on it reads pair too',
    (o) => (o.not_shown ? o : { a: drawView(a.hash)(o), b: drawView(b.hash)(o), later: drawView(later.hash)(o) }))
  no(w, maria, a, 'maria declines')
  no(w, amara, later, 'amara declines the later one too')
  yes(w, sam, b, 'sam accepts')
  ask(w, 'pair', 'every other receiver lets go: the one left lands', 'ownership', [sack, 'held', null], D(true, null, 'landed'),
    'folds.md, A fork is a burden: when every receiver of the fork\'s draws but one has let go, that one is read as a draw alone', drawView(b.hash))
}

// ---- 14. An accepted answer stating 80 of a 100 kg transfer (vector 14) ----
{
  const w = new World('k3 an accept of 80 of 100')
  const harry = w.person('harry'), maria = w.person('maria'), sam = w.person('sam')
  const lot = thing(w, harry, 'maize', kg(100), 'harry\'s 100 kg')
  const t = give(w, harry, lot, maria, kg(100), '100 kg to maria')
  const y = yes(w, maria, t, 'maria accepts 80 of it', { amount: kg(80) })
  ask(w, '80 of 100', '80 lands, 20 freed', 'ownership', [lot, 'held', null], owners([harry, '20'], [maria, '80']),
    'folds.md, Lands: Her accepted answer may state state.amount, no more than the draw\'s: that much lands, and the rest is freed', ownersView(w))
  const rest = give(w, harry, lot, sam, kg(20), 'harry sells the freed 20 to sam', { after: [y.hash] })
  ask(w, '80 of 100', 'the freed 20 can be drawn again', 'ownership', [lot, 'held', null], D(true, null, 'held'), 'folds.md, Freed: The amount is its owner\'s again, for her later draws that have the freeing in their causal past', drawView(rest.hash))
}

// ---- 15. A transfer of zero (vector 30) ----
{
  const w = new World('k3 a transfer of zero')
  const harry = w.person('harry'), maria = w.person('maria')
  const sack = thing(w, harry, 'flour', kg(1), 'harry\'s sack')
  const zero = give(w, harry, sack, maria, kg(0), 'a transfer of 0 kg')
  ask(w, 'zero', 'no draw, not listed', 'ownership', [sack, 'held', null], { listed: false, owners: owners([harry, '1']) }, 'folds.md, What is left: A transfer of zero is no draw',
    (o) => (o.not_shown ? o : { listed: o.draws.some((d) => d.block === zero.hash), owners: ownersView(w)(o) }))
}

// ---- 16. A recall reaches only what passed through that seller's hands (story 18, vector 29) ----
{
  const w = new World('k3 a recall through one seller\'s hands')
  const harry = w.person('harry'), amara = w.person('amara'), rival = w.person('rival')
  const grain = thing(w, harry, 'wheat', kg(1000), 'harry\'s grain')
  const make = put(w, harry, 'transform', {}, { derives_from: [grain.hash] }, 'harry mills it')
  const l7 = put(w, harry, 'thing', { kind: 'flour', pack: kg(1000), marks: [{ scheme: 'lot', value: 'L7' }] }, { of: kindOf('flour'), derives_from: [make.hash] }, 'lot L7')
  const a = give(w, harry, l7, amara, kg(500), '500 kg of L7 to amara'); yes(w, amara, a, 'amara accepts 500')
  const r = give(w, harry, l7, rival, kg(100), '100 kg of L7 to the rival'); const ry = yes(w, rival, r, 'the rival accepts 100')
  const one = give(w, rival, l7, amara, kg(1), 'the rival sells amara 1 kg', { after: [ry.hash] }); yes(w, amara, one, 'amara accepts 1')
  put(w, rival, 'observe', { kind: 'recall', text: 'L7' }, { subject: l7.hash }, 'the rival signs a recall of L7')
  ask(w, 'recall', 'made_from(grain): L7', 'made_from', [grain, 'held'], [{ thing: l7.hash, from: grain.hash, make: make.hash, took: null }],
    'things.md, Marks: A recall names instances, and reaches what was made from them (folds.md, made_from)', (x) => x.map((y) => ({ thing: y.thing, from: y.from, make: y.make, took: L.v(y.took) })))
  ask(w, 'recall', 'Amara holds two parts of one instance', 'ownership', [l7, 'held', null], owners([amara, '501'], [harry, '400'], [rival, '99']),
    'things.md, Parts: a reader who holds 500 kg of lot L7 from Harry and 1 kg from another holds two parts of one instance', ownersView(w))
  ask(w, 'recall', 'the rival\'s draws reach only the 1 kg to Amara', 'ownership', [l7, 'held', null], [{ to: 'amara', amount: '1', takes: true }],
    'things.md, Parts: the other\'s recall ... reaches the 1 kg that came through him (read from the draws list)',
    (o) => o.draws.filter((d) => d.by === rival.id).map((d) => ({ to: L.labels(w)[d.to] || d.to, amount: L.v(d.amount), takes: d.takes })))
}

// ---- 17. A draw on a line with a block held only as its header ----
{
  const w = new World('k3 a line with a header')
  const harry = w.person('harry'), maria = w.person('maria')
  const sack = thing(w, harry, 'flour', kg(1), 'harry\'s sack')
  const note = put(w, harry, 'observe', { kind: 'note', text: 'a sealed note' }, {}, 'a note on harry\'s line')
  const t = give(w, harry, sack, maria, kg('0.5'), '0.5 kg to maria')
  yes(w, maria, t, 'maria accepts')
  const asHeader = w.blocks.map((b) => (b.hash === note.hash ? { header: fb.header(b), header_signature: b.signature } : b))
  ask(w, 'header', 'the draw\'s line is not read whole', 'ownership', [sack, asHeader, null], { not_shown: true, lacks: [note.hash] },
    'folds.md, A fold counts a draw only on its owner\'s line read whole from the draw back to her start (A line); 00-shared, not_shown: its id where ... it is held only as its header')
}

// ---- 18. Shapes: a transfer of an amount (vector 16) ----
{
  const w = new World('k3 shapes of an amount')
  const harry = w.person('harry'), maria = w.person('maria'), gita = w.person('gita')
  const sack = thing(w, harry, 'flour', kg(1), 'harry\'s sack')
  const raw = (state, refs, note) => { const l = L.next(w, harry.keys, harry); return w.add(L.signed(harry, harry.keys, 'transfer', state, refs, { prev: l.prev, seq: l.seq }), note) }
  const noOwner = raw({ amount: amt('5', 'GBP'), count: 3 }, {}, 'an amount naming no instance and no to_owner')
  ask(w, 'shapes', 'its bytes are valid', 'valid', [noOwner, 'held'], [], 'core.md 8: valid is who said these bytes', codes)
  ask(w, 'shapes', 'no instance and no to_owner: required', 'read', [noOwner, 'held'], ['required'], 'core.md 7: A transfer that names no instance in refs.what ... names refs.to_owner (required)', codes)
  const held = raw({ amount: kg('0.5') }, { what: sack.hash, to_holder: gita.id }, 'state.amount with to_holder')
  ask(w, 'shapes', 'state.amount with to_holder: shape', 'read', [held, 'held'], ['shape'], 'core.md 7: A transfer with state.amount names neither refs.to_holder nor refs.to_place (shape)', codes)
  const withOf = raw({ amount: amt('0.5', 'kg', kindOf('flour')) }, { what: sack.hash, to_owner: maria.id }, 'an amount with of beside refs.what')
  ask(w, 'shapes', 'of beside refs.what: shape', 'read', [withOf, 'held'], ['shape'], 'encoding.md, Shapes: A transfer\'s amount beside refs.what, and a thing\'s pack, carry no of (shape)', codes)
  const neg = raw({ amount: amt('-1', 'GBP') }, { to_owner: maria.id }, 'an amount below zero')
  ask(w, 'shapes', 'an amount below zero: shape (a check of the bytes)', 'valid', [neg, 'held'], ['shape'], '03-amounts section 6: { value: "-1", unit: "GBP" } in a transfer is still shape', codes)
  const l = L.next(w, harry.keys, harry)
  const packOf = w.add(L.signed(harry, harry.keys, 'thing', { kind: 'flour', pack: amt('1', 'kg', kindOf('flour')) }, { of: kindOf('flour') }, { prev: l.prev, seq: l.seq }), 'a pack with of')
  ask(w, 'shapes', 'a pack with of: shape (a check of the bytes)', 'valid', [packOf, 'held'], ['shape'], 'protocol.json refusals shape: an amount with of beside refs.what or as a thing\'s pack', codes)
}

// ---- 19. Leila's home farm bakes, and her phone sells (story 21, vectors 31 to 34; five loaves for forty) ----
{
  const w = new World('k3 a home farm bakes and her phone sells')
  const leila = w.person('leila'), farm = w.person('farm', 'machine'), cafe = w.person('cafe'), sam = w.person('sam')
  const tablet = secondKey(w, leila, 'leila\'s tablet key')
  const flour = thing(w, leila, 'flour', kg('2.5'), 'leila\'s 2.5 kg flour')
  const want = put(w, leila, 'promise', { terms: { quantity: amt(5, 'loaf') } }, { what: kindOf('loaf'), to: leila.id }, 'her want of five loaves')
  const g = put(w, leila, 'grant', { kind: 'tool', scope: { types: ['transform'], on: want.hash, limit: kg('2.5') } }, { to: farm.id, what: flour.hash }, 'her grant to the farm')
  yes(w, farm, g, 'the farm accepts')
  const loaves = [1, 2, 3, 4, 5].map((n) => {
    const m = put(w, farm, 'transform', { inputs: [{ from: flour.hash, amount: kg('0.5') }] }, { derives_from: [flour.hash], under: g.hash }, `make ${n}`)
    return put(w, farm, 'thing', { kind: 'loaf' }, { derives_from: [m.hash] }, `loaf ${n}`)
  })
  const sixth = put(w, farm, 'transform', { inputs: [{ from: flour.hash, amount: kg('0.5') }] }, { derives_from: [flour.hash], under: g.hash }, 'make 6: the limit is all drawn')
  const UN = 'UNCLEAR: the grant\'s line, its meter (refs.meter) and how a grant passes a part are stage 4\'s; this world names no meter. '
  ask(w, 'home farm', 'each loaf is Leila\'s from its make', 'ownership', [loaves[0], 'held', null], 'leila', UN + 'folds.md, Her start, case 1; story 21: each loaf is Leila\'s from its make', ownerView(w))
  ask(w, 'home farm', 'a sixth make past the 2.5 kg', 'ownership', [flour, 'held', null], D(false, 'past', null), UN + 'folds.md, What is left: A draw that does not fit takes nothing', drawView(sixth.hash))
  const back = loaves.slice(0, 2).map((loaf, i) => {
    const t = put(w, farm, 'transfer', {}, { what: loaf.hash, to_owner: leila.id, under: g.hash }, `the farm hands back loaf ${i + 1}`)
    yes(w, leila, t, `her phone accepts loaf ${i + 1}`)
    return t
  })
  ask(w, 'home farm', 'vector 31: the hand-back lands on her phone\'s accept', 'ownership', [loaves[0], 'held', null], D(true, null, 'landed'),
    UN + 'folds.md, What is left, A hand-back: It lands on her own key\'s accept, which starts that key\'s line for the part', drawView(back[0].hash))
  const early = give(w, leila, loaves[2], sam, null, 'her phone sells loaf 3 while the grant stands')
  ask(w, 'home farm', 'vector 32: her own key on the tool\'s line', 'ownership', [loaves[2], 'held', null], { owner: 'leila', draw: D(false, 'not_on_line', null) },
    UN + 'folds.md: While the grant stands, her own key never draws on the tool\'s line (not_on_line)', (o) => (o.not_shown ? o : { owner: ownerView(w)(o), draw: drawView(early.hash)(o) }))
  const stop = put(w, leila, 'grant', { status: 'stopped', stop: 'onward' }, { updates: g.hash }, 'her phone stops the farm')
  const waits = give(w, leila, loaves[3], cafe, null, 'her phone sells loaf 4 at once')
  ask(w, 'home farm', 'vector 33: before the farm sees the stop, waiting on end', 'ownership', [loaves[3], 'held', null], 'end',
    UN + 'folds.md, At the grant\'s end: until the end is seen as the cut requires, such a draw is waiting (on: end)', waitingView(waits.hash))
  const seen = put(w, farm, 'observe', { kind: 'note', text: 'stopped' }, { after: [stop.hash] }, 'the farm\'s next block has the stop in its past')
  const sale = give(w, leila, loaves[4], cafe, null, 'her phone sells loaf 5, the farm\'s block in its past', { after: [seen.hash] })
  ask(w, 'home farm', 'vector 33: with the farm\'s block in its past, takes', 'ownership', [loaves[4], 'held', null], D(true, null, 'held'),
    UN + 'folds.md, At the grant\'s end: a later draw by that key that has the end in its causal past may draw on it', drawView(sale.hash))
  const tabletSale = give(w, leila, loaves[3], sam, null, 'her tablet sells loaf 4, the farm\'s block in its past', { after: [seen.hash] }, { key: tablet })
  ask(w, 'home farm', 'vector 34: her tablet, not the key that signed the grant: not_on_line', 'ownership', [loaves[3], 'held', null], D(false, 'not_on_line', null),
    UN + 'folds.md, At the grant\'s end: freed to her, on the line of the key that signed the grant ... any other key\'s takes nothing (not_on_line)', drawView(tabletSale.hash))
}

const names = new Set(questions.map((q) => q.world))
if (require.main === module) L.report(questions)
module.exports = { worlds: global.__worlds.filter((w) => w.name.startsWith('k3 ') && names.has(w.name)), questions }
