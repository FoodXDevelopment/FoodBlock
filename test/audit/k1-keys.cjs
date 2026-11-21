// Stage 1 of FoodBlock 1.8, keys (changes-1.8/01-keys.md, section 5): the cases walked, as signed worlds both engines can be run on.
// Each world is a `World` (lib.cjs). Each question names a door op, its arguments (the blocks held when it was asked) and two answers:
// `expect`, what the spec text says, and `core`, what the Rust core answered. Run alone (`node test/audit/k1-keys.cjs`) it prints every
// question and each place the core differs from the text; `require` it for `{ worlds, questions }`.
const { World, fb } = require('./lib.cjs')
const { call } = require('../../sdk/javascript/src/core.cjs')

const questions = []
const plus = (at, d) => call('add_duration', at, d, null)
const sorted = (xs) => [...xs].sort()
const kp = (seed, suite) => call('keypair', seed.repeat(32), suite || null)
const hashOf = (k) => fb.identity.keyHash(k.public_key_sign, k.suite || null)

// A person whose genesis states a reach and her clock.
function personWith(w, label, { keys, reach, keepers } = {}) {
  keys = keys || fb.generateKeypair()
  const at = new Date(Date.UTC(2026, 10, 1) + w.blocks.length * 60000).toISOString().replace(/\.\d+Z$/, '.000Z')
  // 1.9 3d-3: her clock is `clocks` (the core's door is asked directly; the JS SDK's genesis option is `clocks` too)
  const g = call('genesis', keys, { kind: 'person', at, audience: 'public', reach, clocks: keepers })
  w.add(g, `genesis ${label}`)
  const p = { label, keys, id: g.hash, g }
  w.people[label] = p
  return p
}
// A block of `p` signed by `key` (one of her keys, or his own), seeing `after`.
const by = (w, p, key, type, state, refs, note, after = []) => w.w(p, type, state, refs, note, { key, after: sorted(after.map((b) => b.hash)) })
const confirm = (w, p, key, word, note, after = []) => by(w, p, key, 'observe', { kind: 'note' }, { confirms: [word.hash] }, note, after)
const receipt = (w, keeper, block, note) => w.w(keeper, 'observe', { kind: 'receipt' }, { derives_from: [block.hash] }, note)
// 1.9 3d-4: a span cutoff states the span itself and runs from the receipt it names
const cutoff = (w, keeper, word, from, wait, note) => w.w(keeper, 'observe', { kind: 'cutoff', when: wait }, { subject: word.hash, derives_from: [from.hash] }, note)
const keyGrant = (w, p, key, id, state, refs, note, after = []) => by(w, p, key, 'grant', { kind: 'key', ...state }, { subject: id, ...refs }, note, after)

function ask(w, kase, question, op, args, expect) {
  const held = w.blocks.slice()
  const real = args.map((a) => (a === 'held' ? held : a))
  let core
  try { core = call(op, ...JSON.parse(JSON.stringify(real))) } catch (e) { core = { error: e.message } }
  questions.push({ world: w.name, case: kase, question, op, args: real, expect, core })
  return core
}
const stood = (s) => ({ stands: s.stands, on: sorted(s.waiting.map((x) => x.on)) })

// Maria's list, as her phone (her genesis key, the first voice) writes it: her card by hash first; her mum and brother, both, a week;
// her phone, a month, a day's reach. Her clock: the shop, her host, her aunt, any two. `phoneReach` false leaves the phone with no reach.
function maria(name, { phoneReach = true } = {}) {
  const w = new World(name)
  const maria = w.person('maria'), mum = w.person('mum'), brother = w.person('brother')
  const shop = w.person('shop'), host = w.person('host'), aunt = w.person('aunt')
  const card = fb.generateKeypair()
  const keepers = { names: sorted([shop.id, host.id, aunt.id]), needed: 2 }
  const phone = { key: maria.keys.public_key_sign, wait: 'P30D', ...(phoneReach ? { reach: 'P1D' } : {}) }
  const voices = [{ key_hash: hashOf(card) }, { names: sorted([mum.id, brother.id]), needed: 2, wait: 'P7D' }, phone]
  const list = keyGrant(w, maria, maria.keys, maria.id, { voices, clocks: keepers }, { updates: maria.id }, 'maria writes her list (by her first voice)')
  const yes = confirm(w, maria, maria.keys, list, 'maria signs her list again')
  return { w, maria, mum, brother, shop, host, aunt, card, keepers, voices, list, yes }
}

// ---- A lost phone ----
{
  const m = maria('k1 lost phone')
  const { w } = m
  const last = by(w, m.maria, m.maria.keys, 'observe', { kind: 'note', text: 'the last phone block' }, {}, 'phone: last block', [m.yes])
  const phone2 = fb.generateKeypair()
  const voices = m.voices.map((v, i) => (i === 2 ? { ...v, key: phone2.public_key_sign } : v))
  const g = keyGrant(w, m.mum, m.mum.keys, m.maria.id, { voices, clocks: m.keepers, counted_to: last.hash }, { updates: m.list.hash }, 'mum: a new phone key in the phone place, counted_to its last block', [last])
  const b1 = confirm(w, m.brother, m.brother.keys, g, 'brother confirms')
  ask(w, 'lost phone', 'the relatives\' key grant before its wait has run', 'stands', [g, 'held'], { stands: false, waiting_on_includes: 'wait' })
  const r1 = receipt(w, m.shop, g, 'shop receipts the key grant'), r2 = receipt(w, m.host, g, 'host receipts the key grant')
  const c1 = cutoff(w, m.shop, g, r1, 'P7D', 'shop: cutoff a week on'), c2 = cutoff(w, m.host, g, r2, 'P7D', 'host: cutoff a week on')
  confirm(w, m.mum, m.mum.keys, g, 'mum signs again after the week', [c1, c2])
  confirm(w, m.brother, m.brother.keys, g, 'brother signs again after the week', [c1, c2, b1])
  ask(w, 'lost phone', 'the relatives\' key grant, signed again by both after two keepers closed the week', 'stands', [g, 'held'], { stands: true })
  ask(w, 'lost phone', 'her keys now', 'live_keys', [m.maria.id, 'held'], [phone2.public_key_sign])
  const n = by(w, m.maria, phone2, 'observe', { kind: 'note', text: 'the new phone' }, {}, 'new phone: first block', [w.blocks[w.blocks.length - 1], w.blocks[w.blocks.length - 2]])
  ask(w, 'lost phone', 'the new phone\'s first block names the key grant in refs.key and speaks for her', 'signed_by_author', [n, 'held'], true)
  ask(w, 'lost phone', 'the old phone\'s last block, on the counted line', 'signed_by_author', [last, 'held'], true)
  const late = by(w, m.maria, m.maria.keys, 'observe', { kind: 'note', text: 'the old phone after the cut' }, {}, 'old phone: a block that has seen the cut', [g])
  ask(w, 'lost phone', 'an old phone block that has the key grant in its causal past', 'signed_by_author', [late, 'held'], false)
}

// ---- A stolen phone, with a reach ----
{
  const m = maria('k1 stolen phone, reach')
  const { w } = m
  const sam = w.person('sam')
  const oven = by(w, m.maria, m.maria.keys, 'thing', { kind: 'oven' }, {}, 'her oven', [m.yes])
  const sale = by(w, m.maria, m.maria.keys, 'transfer', {}, { what: oven.hash, to_owner: sam.id }, 'thief (with her phone) sells Sam the oven')
  ask(w, 'stolen phone', 'the sale, a transfer of a key with a day\'s reach, before her clock held it a day', 'stands', [sale, 'held'], { stands: false, waiting_on_includes: 'reach' })
  const rs1 = receipt(w, m.shop, sale, 'shop receipts the sale'), rs2 = receipt(w, m.host, sale, 'host receipts the sale')
  const thief = fb.generateKeypair()
  const tv = m.voices.map((v, i) => (i === 2 ? { ...v, key: thief.public_key_sign } : v))
  const tg = keyGrant(w, m.maria, m.maria.keys, m.maria.id, { voices: tv, clocks: m.keepers }, { updates: m.list.hash }, 'thief: a key grant putting his key in the phone place')
  const rt1 = receipt(w, m.shop, tg, 'shop receipts the thief\'s key grant'), rt2 = receipt(w, m.host, tg, 'host receipts the thief\'s key grant')
  const out = m.voices.filter((_, i) => i !== 2)
  const cut = keyGrant(w, m.mum, m.mum.keys, m.maria.id, { voices: out, clocks: m.keepers }, { updates: m.list.hash }, 'mum: the list without the phone (noon)')
  confirm(w, m.brother, m.brother.keys, cut, 'brother confirms the cut')
  receipt(w, m.shop, cut, 'shop receipts the cut before her cutoff')
  cutoff(w, m.shop, sale, rs1, 'P1D', 'shop: cutoff a day after the sale'), cutoff(w, m.host, sale, rs2, 'P1D', 'host: cutoff a day after the sale')
  ask(w, 'stolen phone', 'the sale, with the cut received first on one keeper\'s line', 'stands', [sale, 'held'], { stands: false, waiting: [] })
  const c1 = cutoff(w, m.shop, tg, rt1, 'P30D', 'shop: a month after the thief\'s key grant'), c2 = cutoff(w, m.host, tg, rt2, 'P30D', 'host: a month after the thief\'s key grant')
  confirm(w, m.maria, m.maria.keys, tg, 'thief signs his key grant again after the month', [c1, c2])
  // 1.9 end pass (2026-11-20): renewed to the answer both engines give under 1.9 (each built from the text apart); the 1.8 stage 1 answer was { stands: false, waiting: [] }: the key grant waits on its wait and its reach (CORE-SET 3d: a mail key grant waits reach)
  ask(w, 'stolen phone', 'the thief\'s key grant: the relatives\' no was received first', 'stands', [tg, 'held'], { stands: false, waiting: ['wait', 'reach'] })
}

// ---- A stolen phone, with no reach: a relier unseen keeps the sale ----
{
  const m = maria('k1 stolen phone, no reach', { phoneReach: false })
  const { w } = m
  const sam = w.person('sam')
  const oven = by(w, m.maria, m.maria.keys, 'thing', { kind: 'oven' }, {}, 'her oven', [m.yes])
  const sale = by(w, m.maria, m.maria.keys, 'transfer', {}, { what: oven.hash, to_owner: sam.id }, 'thief sells Sam the oven')
  const took = w.w(sam, 'transfer', { status: 'accepted' }, { answers: sale.hash }, 'Sam accepts, unseen')
  const out = m.voices.filter((_, i) => i !== 2)
  const cut = keyGrant(w, m.mum, m.mum.keys, m.maria.id, { voices: out, clocks: m.keepers }, { updates: m.list.hash }, 'mum: the list without the phone')
  confirm(w, m.brother, m.brother.keys, cut, 'brother confirms the cut')
  ask(w, 'stolen phone, no reach', 'the sale a relier used before seeing the cut (rule 19)', 'stands', [sale, 'held'], { stands: true })
  void took
}

// ---- A thief with ten minutes (the planted grant) ----
{
  const m = maria('k1 a thief with ten minutes')
  const { w } = m
  const leila = w.person('leila'), buyer = w.person('buyer')
  const lk = fb.generateKeypair()
  const tv = m.voices.map((v, i) => (i === 2 ? { key: lk.public_key_sign } : v))
  const k1 = keyGrant(w, m.maria, m.maria.keys, m.maria.id, { voices: tv, clocks: m.keepers }, { updates: m.list.hash }, '(1) leila: her key in the phone place, with no wait and no reach', [m.yes])
  ask(w, 'thief with ten minutes', '(1) a key grant that loosens its own place is no key grant', 'stands', [k1, 'held'], { stands: false, waiting: [] })
  const g2 = by(w, m.maria, m.maria.keys, 'grant', { kind: 'act', scope: { types: ['transfer'] } }, { to: leila.id }, '(2) leila: a grant to her own id')
  ask(w, 'thief with ten minutes', '(2) the planted grant, never signed again', 'stands', [g2, 'held'], { stands: false, waiting_on_includes: 'wait' })
  const g3 = by(w, m.maria, m.maria.keys, 'observe', { kind: 'account', destination: 'leila\'s wallet' }, {}, '(3) leila: a new account word')
  ask(w, 'thief with ten minutes', '(3) the account word, never signed again', 'stands', [g3, 'held'], { stands: false, waiting_on_includes: 'wait' })
  const van = by(w, m.maria, m.maria.keys, 'thing', { kind: 'van' }, {}, 'her van')
  const sale = by(w, m.maria, m.maria.keys, 'transfer', {}, { what: van.hash, to_owner: buyer.id }, '(4) leila: a sale of the van')
  const r1 = receipt(w, m.shop, sale, 'shop receipts the van sale'), r2 = receipt(w, m.aunt, sale, 'aunt receipts the van sale')
  cutoff(w, m.shop, sale, r1, 'P1D', 'shop: a day on'), cutoff(w, m.aunt, sale, r2, 'P1D', 'aunt: a day on')
  w.w(buyer, 'transfer', { status: 'accepted' }, { answers: sale.hash }, 'the buyer accepts the van')
  // 1.9 end pass (2026-11-20): renewed to the answer both engines give under 1.9 (each built from the text apart); the 1.8 stage 1 answer was { stands: true }: an end the sale has not seen waits it (blocks.md, Finality: \`end\`)
  ask(w, 'thief with ten minutes', '(4) the van sale, a day passed unseen', 'stands', [sale, 'held'], { stands: false, waiting_on_includes: 'end' })
}

// ---- A malicious host ----
{
  const m = maria('k1 a malicious host')
  const { w } = m
  const phone2 = fb.generateKeypair()
  const voices = m.voices.map((v, i) => (i === 2 ? { ...v, key: phone2.public_key_sign } : v))
  const g = keyGrant(w, m.mum, m.mum.keys, m.maria.id, { voices, clocks: m.keepers }, { updates: m.list.hash }, 'mum: a new phone key', [m.yes])
  confirm(w, m.brother, m.brother.keys, g, 'brother confirms')
  const r = receipt(w, m.host, g, 'host receipts it')
  const early = cutoff(w, m.host, g, r, 'P7D', 'host alone backdates a cutoff a week on')
  confirm(w, m.mum, m.mum.keys, g, 'mum signs again on the host\'s cutoff alone', [early])
  confirm(w, m.brother, m.brother.keys, g, 'brother signs again on the host\'s cutoff alone', [early])
  ask(w, 'malicious host', 'one keeper of three, two needed, cannot close a wait alone', 'stands', [g, 'held'], { stands: false, waiting_on_includes: 'wait' })
  // her first voice asks nothing of the clock: she shows the card and names new keepers
  const k2 = fb.generateKeypair()
  const ck = { names: sorted([m.shop.id, m.aunt.id]), needed: 2 }
  const cv = m.voices.map((v, i) => (i === 2 ? { ...v, key: k2.public_key_sign } : v))
  const show = keyGrant(w, m.maria, m.card, m.maria.id, { voices: cv, clocks: ck, shown_key: m.card.public_key_sign }, { updates: m.list.hash, key: m.list.hash }, 'card shows itself: a new phone key and new keepers', [m.yes])
  // 1.9 end pass (2026-11-20): renewed to the answer both engines give under 1.9 (each built from the text apart); the 1.8 stage 1 answer was waiting on confirm: the first voice asks nothing of the clock and its wait is zero (identity.md, The first voice)
  ask(w, 'malicious host', 'the card\'s key grant, before its second signature', 'stands', [show, 'held'], { stands: true })
  confirm(w, m.maria, m.card, show, 'card signs again')
  ask(w, 'malicious host', 'the card\'s key grant, signed twice (the first voice waits on nothing)', 'stands', [show, 'held'], { stands: true })
  ask(w, 'malicious host', 'her clock now', 'identity_state', [m.maria.id, 'held'], { clocks: ck })
}

// ---- Quarrelling relatives ----
{
  const w = new World('k1 quarrelling relatives')
  const maria = w.person('maria'), mum = w.person('mum'), brother = w.person('brother'), sister = w.person('sister')
  const shop = w.person('shop'), host = w.person('host')
  const card = fb.generateKeypair()
  const keepers = { names: sorted([shop.id, host.id]), needed: 2 }
  const voices = [{ key_hash: hashOf(card) }, { names: sorted([mum.id, brother.id, sister.id]), needed: 2, wait: 'P7D' }, { key: maria.keys.public_key_sign, wait: 'P30D' }]
  const list = keyGrant(w, maria, maria.keys, maria.id, { voices, clocks: keepers }, { updates: maria.id }, 'maria writes her list')
  const yes = confirm(w, maria, maria.keys, list, 'maria signs her list again')
  const ka = fb.generateKeypair(), kb = fb.generateKeypair(), kc = fb.generateKeypair()
  const at = (k) => voices.map((v, i) => (i === 2 ? { ...v, key: k.public_key_sign } : v))
  const a = keyGrant(w, mum, mum.keys, maria.id, { voices: at(ka), clocks: keepers }, { updates: list.hash }, 'mum: one key', [yes])
  confirm(w, brother, brother.keys, a, 'brother confirms mum\'s')
  const b = keyGrant(w, sister, sister.keys, maria.id, { voices: at(kb), clocks: keepers }, { updates: list.hash }, 'sister: another key, not seeing mum\'s', [yes])
  confirm(w, mum, mum.keys, b, 'mum confirms sister\'s too')
  ask(w, 'quarrelling relatives', 'two key grants of one voice that do not see each other: the first', 'stands', [a, 'held'], { stands: false, waiting: [] })
  ask(w, 'quarrelling relatives', 'two key grants of one voice that do not see each other: the second', 'stands', [b, 'held'], { stands: false, waiting: [] })
  const c = keyGrant(w, brother, brother.keys, maria.id, { voices: at(kc), clocks: keepers }, { updates: list.hash }, 'brother: a third that has both in its past', [a, b])
  confirm(w, sister, sister.keys, c, 'sister confirms the third')
  const r1 = receipt(w, shop, c, 'shop receipts the third'), r2 = receipt(w, host, c, 'host receipts the third')
  const c1 = cutoff(w, shop, c, r1, 'P7D', 'shop: a week on'), c2 = cutoff(w, host, c, r2, 'P7D', 'host: a week on')
  const s1 = confirm(w, brother, brother.keys, c, 'brother signs the third again', [c1, c2])
  confirm(w, sister, sister.keys, c, 'sister signs the third again', [c1, c2, s1])
  ask(w, 'quarrelling relatives', 'a third key grant of the voice that has both in its past, after its wait', 'stands', [c, 'held'], { stands: true })
}

// ---- Death ----
// 1.9 R-H7 (D9; 3d-15, 3d-16): no successor and no close observe. His close is a key grant that leaves no voice of his list; his will is his
// own transfer on `{ closed: <his id> }`, holding nothing while he can sign and taking at his close. The witnesses' key grant leaves his card
// (the first voice is always a key of his), so it is no close; the card's own key grant that leaves no voice is.
{
  const w = new World('k1 death')
  const harry = w.person('harry'), doctor = w.person('doctor'), sister = w.person('sister'), nephew = w.person('nephew'), heir = w.person('heir')
  const shop = w.person('shop'), host = w.person('host')
  const card = fb.generateKeypair()
  const keepers = { names: sorted([shop.id, host.id]), needed: 2 }
  const voices = [{ key_hash: hashOf(card) }, { names: sorted([doctor.id, sister.id]), needed: 2, wait: 'P14D' }, { key: harry.keys.public_key_sign }]
  const list = keyGrant(w, harry, harry.keys, harry.id, { voices, clocks: keepers }, { updates: harry.id }, 'harry writes his list')
  const yes = confirm(w, harry, harry.keys, list, 'harry signs his list again')
  const boat = by(w, harry, harry.keys, 'thing', { kind: 'boat', name: 'harry\'s boat' }, { of: 'b0'.repeat(32) }, 'harry\'s boat', [yes])
  const will = by(w, harry, harry.keys, 'transfer', { condition: { closed: harry.id } }, { what: boat.hash, to_owner: heir.id }, 'harry wills his boat to the heir')
  const took = w.w(heir, 'transfer', { status: 'accepted' }, { answers: will.hash }, 'the heir accepts the will')
  ask(w, 'death', 'a will holds nothing while he can sign', 'ownership', [boat, 'held'], { owner: harry.id })
  const dead = keyGrant(w, doctor, doctor.keys, harry.id, { voices: [voices[0]], clocks: keepers }, { updates: list.hash }, 'the doctor records the death: no voice at their place or below', [yes])
  confirm(w, sister, sister.keys, dead, 'his sister confirms')
  const no = keyGrant(w, harry, harry.keys, harry.id, { voices, clocks: keepers }, { updates: list.hash }, 'the nephew, with the phone, says no')
  const r1 = receipt(w, shop, dead, 'shop receipts the death'), r2 = receipt(w, host, dead, 'host receipts the death')
  receipt(w, shop, no, 'shop receipts the phone\'s no')
  const c1 = cutoff(w, shop, dead, r1, 'P14D', 'shop: fourteen days on'), c2 = cutoff(w, host, dead, r2, 'P14D', 'host: fourteen days on')
  const d1 = confirm(w, doctor, doctor.keys, dead, 'the doctor signs again', [c1, c2])
  const d2 = confirm(w, sister, sister.keys, dead, 'his sister signs again', [c1, c2, d1])
  ask(w, 'death', 'the witnesses\' key grant: the phone is below them, so its no is none', 'stands', [dead, 'held'], { stands: true })
  ask(w, 'death', 'the card still a voice: no close yet', 'condition_holds', [{ closed: harry.id }, 'held', null], false)
  const close = keyGrant(w, harry, card, harry.id, { voices: [], clocks: keepers, shown_key: card.public_key_sign }, { updates: dead.hash, key: dead.hash }, 'his card closes his list: a key grant that leaves no voice', [d2, took])
  ask(w, 'death', 'his close stands', 'stands', [close, 'held'], { stands: true })
  ask(w, 'death', '{ closed: harry } holds, read for every block held', 'condition_holds', [{ closed: harry.id }, 'held', null], true)
  ask(w, 'death', 'at his close his will takes', 'ownership', [boat, 'held'], { owner: heir.id })
  const later = keyGrant(w, harry, harry.keys, harry.id, { voices, clocks: keepers }, { updates: list.hash }, 'a key grant of harry after the close', [close])
  ask(w, 'death', 'after his close no key grant of his counts', 'stands', [later, 'held'], { stands: false, waiting: [] })
  void nephew
}

// ---- Mama Achieng: one basic phone and a card ----
{
  const w = new World('k1 one basic phone and a card')
  const cardA = kp('a1', 'p256'), cardB = kp('b1', 'p256'), cardA2 = kp('a2', 'p256')
  const mama = personWith(w, 'mama', { keys: cardA })
  const soko = w.person('soko'), stranger = w.person('stranger')
  const voices = [{ key_hash: hashOf(cardB) }, { key: cardA.public_key_sign, suite: 'p256', wait: 'PT0S' }]
  const list = keyGrant(w, mama, cardA, mama.id, { voices }, { updates: mama.id }, 'card A writes her list: card B by hash above it')
  const yes = confirm(w, mama, cardA, list, 'card A signs her list again (a second PIN)')
  ask(w, 'basic phone', 'her list, signed twice at the kiosk, no keepers', 'stands', [list, 'held'], { stands: true })
  const toSoko = by(w, mama, cardA, 'grant', { kind: 'act', scope: { types: ['observe.witness'] } }, { to: soko.id }, 'her grant to Soko', [yes])
  confirm(w, mama, cardA, toSoko, 'card A signs the grant to Soko again')
  ask(w, 'basic phone', 'her grant to Soko, signed twice (a wait of zero has run at once)', 'stands', [toSoko, 'held'], { stands: true })
  // card A stolen with its PIN: the thief signs as her
  const sold = by(w, mama, cardA, 'thing', { kind: 'goat' }, {}, 'thief with card A: a goat', [yes])
  const sale = by(w, mama, cardA, 'transfer', {}, { what: sold.hash, to_owner: stranger.id }, 'thief with card A: sells the goat')
  w.w(stranger, 'transfer', { status: 'accepted' }, { answers: sale.hash }, 'the stranger accepts, unseen')
  const nv = [voices[0], { ...voices[1], key: cardA2.public_key_sign }]
  const show = keyGrant(w, mama, cardB, mama.id, { voices: nv, shown_key: cardB.public_key_sign }, { updates: list.hash, key: list.hash }, 'card B shows itself: a new card in A\'s place', [yes])
  confirm(w, mama, cardB, show, 'card B signs again')
  ask(w, 'basic phone', 'card B\'s key grant, signed twice', 'stands', [show, 'held'], { stands: true })
  ask(w, 'basic phone', 'the thief\'s sale a relier used unseen still stands (no clock, no reach)', 'stands', [sale, 'held'], { stands: true })
  const after = by(w, mama, cardA, 'observe', { kind: 'note', text: 'the thief after the cut' }, {}, 'thief with card A after seeing the cut', [show])
  ask(w, 'basic phone', 'a block of card A that has seen the cut', 'signed_by_author', [after, 'held'], false)
}

// ---- One voice and no clock ----
{
  const w = new World('k1 one voice and no clock')
  const ana = w.person('ana'), x = w.person('x')
  const g = w.w(ana, 'grant', { kind: 'act', scope: { types: ['transfer'] } }, { to: x.id }, 'a grant (anyone with her key)')
  // 1.9 end pass (2026-11-20): renewed to the answer both engines give under 1.9 (each built from the text apart); the 1.8 stage 1 answer was waiting on confirm: one voice, the first, has wait zero (identity.md, The first voice)
  ask(w, 'one voice', 'a grant signed once', 'stands', [g, 'held'], { stands: true })
  w.w(ana, 'observe', { kind: 'note' }, { confirms: [g.hash] }, 'signed again by the same key')
  ask(w, 'one voice', 'the grant, signed again by the one key', 'stands', [g, 'held'], { stands: true })
  // 1.9 (CORE-SET 3b-11): each voice says whether what it signs passes
  ask(w, 'one voice', 'her list', 'identity_state', [ana.id, 'held'], { voices: [{ key: ana.keys.public_key_sign, passes: false }], clocks: null })
}

// ---- A broken suite ----
{
  const w = new World('k1 a broken suite')
  const harry = w.person('harry')
  const card = kp('c3', 'p256'), phoneP = kp('d4', 'p256')
  const voices = [{ key_hash: hashOf(card) }, { key: harry.keys.public_key_sign }]
  const list = keyGrant(w, harry, harry.keys, harry.id, { voices }, { updates: harry.id }, 'harry: a sound-suite card by hash above his std phone')
  const yes = confirm(w, harry, harry.keys, list, 'harry signs it again')
  const forged = by(w, harry, harry.keys, 'observe', { kind: 'note', text: 'a forgery in the broken suite' }, {}, 'the forger signs as his phone', [yes])
  const nv = [voices[0], { key: phoneP.public_key_sign, suite: 'p256' }]
  const move = keyGrant(w, harry, card, harry.id, { voices: nv, shown_key: card.public_key_sign }, { updates: list.hash, key: list.hash }, 'the card shows itself and puts a p256 key in the phone place', [yes])
  confirm(w, harry, card, move, 'the card signs again')
  ask(w, 'broken suite', 'the suite move, signed twice by the first voice', 'stands', [move, 'held'], { stands: true })
  // 1.9 end pass (2026-11-20): renewed to the answer both engines give under 1.9: to a reader who believes the old suite, a suite move is an end,
  // read as any end is (CORE-SET 3d-12), so a block that has not seen it still counts; the cut by causal order alone is the half for a reader
  // who no longer believes the suite, which no door argument names (not built). The 1.8 stage 1 answer was false.
  ask(w, 'broken suite', 'an old-key block not in the move\'s causal past, to a reader who believes the old suite, still counts', 'signed_by_author', [forged, 'held'], true)
  ask(w, 'broken suite', 'a block that does not count forms no pair', 'fork_pairs', ['held'], [])
}

// ---- Two key grants of one key voice that do not see each other ----
{
  const m = maria('k1 two key grants of one voice')
  const { w } = m
  const t1 = fb.generateKeypair(), t2 = fb.generateKeypair()
  const before = w.blocks.slice()
  const a = keyGrant(w, m.maria, m.maria.keys, m.maria.id, { public_key_sign: t1.public_key_sign }, {}, 'phone: a tablet key', [m.yes])
  // a copy of the phone that has not seen the first writes from the blocks before it
  const copy = fb.write('grant', { kind: 'key', public_key_sign: t2.public_key_sign }, { subject: m.maria.id }, { author: m.maria.id, key: m.maria.keys, held: before, at: new Date(Date.UTC(2026, 10, 2)).toISOString(), audience: 'public', after: [m.yes.hash] })
  const b = w.add(copy, 'phone (a copy, not seeing the first): another key, naming the same prev')
  ask(w, 'two by one voice', 'one of a pair of one voice', 'stands', [a, 'held'], { stands: false, waiting: [] })
  ask(w, 'two by one voice', 'the other', 'stands', [b, 'held'], { stands: false, waiting: [] })
}

// ---- A key under a voice ----
{
  const m = maria('k1 a key under a voice')
  const { w } = m
  const tablet = fb.generateKeypair(), late = fb.generateKeypair()
  const u = keyGrant(w, m.maria, m.maria.keys, m.maria.id, { public_key_sign: tablet.public_key_sign }, {}, 'phone: the tablet under it', [m.yes])
  // the phone's wait is a month: a voice above (the card) signs it
  const show = keyGrant(w, m.maria, m.card, m.maria.id, { voices: m.voices, clocks: m.keepers, shown_key: m.card.public_key_sign }, { updates: m.list.hash, key: m.list.hash }, 'card shows itself (restating the list)', [m.yes])
  const above = confirm(w, m.maria, m.card, u, 'the card, a voice above, signs the tablet grant', [show])
  ask(w, 'key under a voice', 'the tablet grant, signed by a voice above before her clock received it: her own later block names it (the cut), and a voice above signed it (signed twice, reach)', 'stands', [u, 'held'], { stands: true })
  receipt(w, m.shop, u, 'shop receipts the tablet grant'), receipt(w, m.host, u, 'host receipts the tablet grant')
  ask(w, 'key under a voice', 'the tablet grant, signed by a voice above and received by two keepers', 'stands', [u, 'held'], { stands: true })
  const t1 = by(w, m.maria, tablet, 'observe', { kind: 'note', text: 'tablet' }, {}, 'tablet: first block', [above])
  ask(w, 'key under a voice', 'the tablet speaks while its voice does', 'signed_by_author', [t1, 'held'], true)
  const u2 = keyGrant(w, m.maria, m.maria.keys, m.maria.id, { public_key_sign: late.public_key_sign }, {}, 'phone: a second key under it, after the tablet', [u, above])
  const phone2 = fb.generateKeypair()
  const voices = m.voices.map((v, i) => (i === 2 ? { ...v, key: phone2.public_key_sign } : v))
  const g = keyGrant(w, m.maria, m.card, m.maria.id, { voices, clocks: m.keepers }, { updates: m.list.hash }, 'the card puts a new phone key in place, having seen the tablet grant but not the second', [u, above])
  const gy = confirm(w, m.maria, m.card, g, 'the card signs it again')
  const u2y = confirm(w, m.maria, m.card, u2, 'the card signs the second key grant (after the new phone)')
  const t2 = by(w, m.maria, tablet, 'observe', { kind: 'note', text: 'tablet after the new phone' }, {}, 'tablet after the phone was replaced (its grant inside the cut)', [gy, t1])
  ask(w, 'key under a voice', 'the tablet goes on under the new phone key (its grant inside the cut)', 'signed_by_author', [t2, 'held'], true)
  const l1 = by(w, m.maria, late, 'observe', { kind: 'note', text: 'the second key' }, {}, 'the second key, its grant outside the cut', [gy, u2y])
  // 1.9 end pass (2026-11-20): renewed to the answer both engines give under 1.9 (each built from the text apart); the 1.8 stage 1 answer was false
  ask(w, 'key under a voice', 'a key under the phone whose grant the replacement did not see ends with the phone', 'signed_by_author', [l1, 'held'], true)
}

// ---- A lower voice trying to change its own wait ----
{
  const m = maria('k1 a lower voice loosens its own wait')
  const { w } = m
  const voices = m.voices.map((v, i) => (i === 2 ? { ...v, wait: 'PT0S' } : v))
  const g = keyGrant(w, m.maria, m.maria.keys, m.maria.id, { voices, clocks: m.keepers }, { updates: m.list.hash }, 'phone: its own wait set to zero', [m.yes])
  confirm(w, m.maria, m.maria.keys, g, 'phone signs it again')
  ask(w, 'lower voice', 'a voice that changes its own wait signs no key grant', 'stands', [g, 'held'], { stands: false, waiting: [] })
}

// ---- The short reply ----
{
  const w = new World('k1 the short reply')
  const mama = w.person('mama'), soko = w.person('soko'), host = w.person('host')
  const oven = w.w(soko, 'thing', { kind: 'oven' }, {}, 'an oven')
  const offer = w.w(soko, 'promise', { terms: { price: { value: '90', unit: 'KES' } } }, { from: soko.id, to: mama.id, what: oven.hash }, 'Soko offers the oven')
  const rb = w.w(host, 'observe', { kind: 'readback', readback: 'ab'.repeat(32) }, { for: [offer.hash] }, 'the host\'s readback')
  const before = w.blocks.slice()
  const yes = w.w(mama, 'promise', { status: 'accepted' }, { answers: offer.hash, for: offer.hash, derives_from: [rb.hash] }, 'her key signs her yes')
  const text = call('short_reply', yes)
  questions.push({ world: w.name, case: 'short reply', question: 'the reply rebuilt from FB1 text is her signed block', op: 'short_reply_open', args: [text, mama.id, before], expect: { hash: yes.hash }, core: call('short_reply_open', text, mama.id, before) })
  const without = before.filter((b) => b.hash !== offer.hash)
  questions.push({ world: w.name, case: 'short reply', question: 'the same reply against blocks without the offer opens nothing', op: 'short_reply_open', args: [text, mama.id, without], expect: null, core: call('short_reply_open', text, mama.id, without) })
}

// How each answer compares with what the text says.
function agrees(q) {
  const e = q.expect, c = q.core
  if (e === null || typeof e !== 'object' || Array.isArray(e)) return JSON.stringify(c) === JSON.stringify(Array.isArray(e) ? e : e) || (Array.isArray(e) && Array.isArray(c) && JSON.stringify(sorted(c)) === JSON.stringify(sorted(e)))
  if (c && typeof c === 'object' && 'stands' in e) {
    const s = stood(c)
    if (s.stands !== e.stands) return false
    if (e.waiting) return s.on.length === e.waiting.length
    if (e.waiting_on_includes) return s.on.includes(e.waiting_on_includes)
    return true
  }
  if (c && typeof c === 'object') return Object.entries(e).every(([k, v]) => JSON.stringify(c[k]) === JSON.stringify(v))
  return false
}
for (const q of questions) q.agrees = agrees(q)

if (require.main === module) {
  for (const q of questions) console.log(`${q.agrees ? '=' : 'DIFFERS'} | ${q.case} | ${q.question} | core ${JSON.stringify(q.core && q.core.stands !== undefined ? stood(q.core) : q.core).slice(0, 160)}`)
  const n = questions.filter((q) => !q.agrees).length
  console.log(`\n${questions.length} questions, ${n} where the core differs from the text`)
}
module.exports = { worlds: global.__worlds.filter((w) => w.name.startsWith('k1 ')), questions }
