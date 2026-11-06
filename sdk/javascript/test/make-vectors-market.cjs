// Adds to spec/vectors.json the cases of the market's shapes (promises.md: Finding, A signed check, Clearing, Rulings, and the group and voucher walks that
// need no new op): `listing_check`, `check_reads`, `clearing_applied`, `ruling_releases`, the condition `ruled`, the base schema `judging`, circles as groups,
// an IOU or voucher issued and passed on. `node test/make-vectors-market.cjs`, after `node scripts/build-wasm.cjs` and `node test/make-schemas.cjs`.
// Idempotent. Each expectation is written by hand from the spec text; the Rust core must give it and so must the oracle (spec/oracle).
const assert = require('assert/strict')
const fs = require('fs')
const path = require('path')
const vectorsFile = require('./vectors-file.cjs')
const { V, tags } = vectorsFile.load()
const kit = require('./vectors-kit.cjs')(V)
const { story, door, holds, M, LATER, call } = kit

const accept = (s, who, deal, extra = {}) => s.say(who, 'promise', { status: 'accepted' }, { answers: deal.hash, for: deal.hash, after: [deal.hash], ...extra })
const confirm = (s, who, block) => s.say(who, 'observe', { kind: 'confirm' }, { confirms: block.hash, after: [block.hash] })
const NOW = '2027-03-01T00:00:00.000Z'

// ---- Finding: a list-keeper's answer is signed blocks, never claims ----
{
  const s = story(), keeper = s.person('mk-keeper'), maria = s.person('mk-maria'), joe = s.person('mk-joe'), cafe = s.person('mk-cafe'), asker = s.person('mk-asker')
  const eggs = s.say(maria, 'thing', { kind: 'eggs' }, {}), milk = s.say(joe, 'thing', { kind: 'milk' }, {})
  const offer = (who, what, terms) => s.say(who, 'promise', { what: 'a dozen', terms }, { from: who.id, what: what.hash })
  const o1 = offer(maria, eggs, { price: M(300) }), o2 = offer(joe, milk, { price: M(100) }), o3 = offer(joe, eggs, { price: M(350) })
  const want = s.say(cafe, 'promise', { what: 'eggs wanted', terms: { price: M(300) } }, { to: cafe.id, what: eggs.hash })
  const named = s.say(maria, 'promise', { what: 'for Joe only', terms: { price: M(250) } }, { from: maria.id, to: joe.id, what: eggs.hash })
  const lookup = (state, refs = {}) => s.say(asker, 'observe', { kind: 'lookup', ...state }, refs)
  const listing = (ask, items, who = keeper) => s.say(who, 'observe', { kind: 'listing' }, { answers: ask.hash, ...(items.length ? { derives_from: items.map((i) => i.hash) } : {}) })
  const check = (name, ask, ans, expect, inv) => door(`listing: ${name}`, 'listing_check', [ask, ans, s.held], { expect, exact: false, invariants: inv })
  const L = lookup({ side: 'offer' }, { what: eggs.hash })
  check('a keeper that names the egg offers is ok, and what it left out is said', L, listing(L, [o1]), { ok: true, bad: [], left_out: [o3.hash] }, [33])
  check('naming every offer that fits leaves nothing out', L, listing(L, [o1, o3]), { ok: true, bad: [], left_out: [] }, [33])
  check('no item at all is a list that found none, and says what it left out', L, listing(L, []), { ok: true, bad: [], left_out: [o1.hash, o3.hash].sort() }, [33])
  const fake = listing(L, [o2])
  check('an offer that names none of the things asked for is no match', L, fake, { ok: false, bad: [{ hash: o2.hash }] }, [33])
  const nowhere = '9'.repeat(64)
  check('a block the reader does not hold is not a real offer', L, listing(L, [{ hash: nowhere }]), { ok: false, bad: [{ hash: nowhere }] }, [33])
  check('a want is not an offer', L, listing(L, [want]), { ok: false, bad: [{ hash: want.hash }] }, [33])
  check('an offer to a named person is not open to anyone', L, listing(L, [named]), { ok: false, bad: [{ hash: named.hash }] }, [33])
  const W = lookup({ side: 'want' }, { what: eggs.hash })
  check('a want is what a want lookup finds', W, listing(W, [want]), { ok: true, bad: [], left_out: [] }, [33])
  const T = lookup({ side: 'offer', terms: { price: M(350) } }, { what: eggs.hash })
  check('a term the lookup asks for filters', T, listing(T, [o1]), { ok: false, bad: [{ hash: o1.hash }] }, [33])
  check('and the item that carries it is ok', T, listing(T, [o3]), { ok: true, bad: [], left_out: [] }, [33])
  // an offer written by the keeper in Maria's name is no offer of hers
  const forged = s.say(keeper, 'promise', { what: 'a dozen', terms: { price: M(1) } }, { from: maria.id, what: eggs.hash })
  check('an offer only the keeper signed, naming Maria as the side, is not backed by her', L, listing(L, [forged]), { ok: false, bad: [{ hash: forged.hash }] }, [33])
  const stopped = offer(maria, eggs, { price: M(200) })
  s.say(maria, 'promise', { status: 'stopped', stop: 'before' }, { updates: stopped.hash, for: stopped.hash, after: [stopped.hash] })
  check('an offer its signer stopped is no longer open', L, listing(L, [stopped]), { ok: false, bad: [{ hash: stopped.hash }] }, [33])
  const other = lookup({ side: 'offer' }, { what: milk.hash })
  check('a listing answers one lookup: another is refused', L, listing(other, [o2]), { ok: false }, [33])
  check('a block that is no lookup is refused', want, listing(L, [o1]), { ok: false }, [33])
  check('a lookup says its side', lookup({}), listing(L, [o1]), { ok: false }, [33])
  const noListing = s.say(keeper, 'observe', { kind: 'message' }, { answers: L.hash })
  check('a block that is no listing is refused', L, noListing, { ok: false }, [33])
}

// ---- A signed check of someone's record ----
{
  const s = story(), baker = s.person('ck-baker'), checker = s.person('ck-checker'), other = s.person('ck-other'), cafe = s.person('ck-cafe')
  const bread = s.say(baker, 'thing', { kind: 'bread' }, {})
  const deals = [1, 2, 3].map((n) => { const d = s.say(baker, 'promise', { what: `loaves ${n}`, terms: { price: M(100 * n) } }, { from: baker.id, to: cafe.id, what: bread.hash }); accept(s, cafe, d); return d })
  const mine = s.say(other, 'promise', { what: 'not hers', terms: {} }, { from: other.id, to: cafe.id, what: bread.hash })
  const say = (state, derives, subject = baker.id) => s.say(checker, 'observe', { kind: 'check', ...state }, { subject, derives_from: derives.map((d) => d.hash) })
  const chk = (name, block, expect) => door(`check: ${name}`, 'check_reads', [block, s.held], { expect, invariants: [34] })
  chk('three deals she is a side of, all as the check says', say({ of: 'promise', count: 3, stage: 'accepted' }, deals), { ok: true, why: null, read: [{ held: true, concerns: true, stage: 'accepted' }, { concerns: true }, { concerns: true }] })
  chk('a check that says no more than what it read is ok', say({}, deals.slice(0, 1)), { ok: true })
  chk('a count that is not what it names', say({ count: 200 }, deals), { ok: false })
  chk('a block that is another person\'s record', say({}, [deals[0], mine]), { ok: false, read: [{ concerns: true }, { concerns: false }] })
  chk('a stage that is not the stage of each', say({ stage: 'done' }, deals), { ok: false })
  chk('a type that is not the type of each', say({ of: 'transfer' }, deals), { ok: false })
  chk('a block not held', say({}, [{ hash: '8'.repeat(64) }]), { ok: false, read: [{ held: false, concerns: false }] })
  chk('a check names the subject', s.say(checker, 'observe', { kind: 'check' }, { derives_from: [deals[0].hash] }), { ok: false })
  chk('a check names what it read', s.say(checker, 'observe', { kind: 'check', text: 'all good' }, { subject: baker.id }), { ok: false })
  chk('a block that is no check', mine, { ok: false })
}

// ---- Clearing: a circle of IOUs cancelled ----
{
  const s = story(), a = s.person('cl-a'), b = s.person('cl-b'), c = s.person('cl-c'), finder = s.person('cl-finder')
  // an IOU: the debtor asks (to = debtor), the creditor accepts; the price is what the debtor owes the creditor
  const iou = (debtor, creditor, price) => { const d = s.say(debtor, 'promise', { what: 'IOU', terms: { price } }, { from: creditor.id, to: debtor.id }); accept(s, creditor, d); return d }
  const ab = iou(a, b, M(1000)), bc = iou(b, c, M(1000)), ca = iou(c, a, M(1000))
  const lines = (...pairs) => pairs.map(([deal, reduce, extra]) => ({ deal: deal.hash, reduce, ...(extra || {}) }))
  const clear = (ls, text) => s.say(finder, 'observe', { kind: 'clearing', lines: ls, ...(text ? { text } : {}) }, {})
  const run = (name, block, held, expect) => door(`clearing: ${name}`, 'clearing_applied', [block, held], { expect, invariants: [35] })
  const X = clear(lines([ab, M(1000)], [bc, M(1000)], [ca, M(1000)]))
  run('the whole circle is listed, and nobody has signed: it binds no one', X, s.held, { binds: false, missing: [a.id, b.id, c.id].sort(), lines: [{ ok: true, left: { minor: 0 } }, { ok: true }, { ok: true }] })
  confirm(s, a, X); confirm(s, b, X)
  run('two of three have signed: it still binds no one', X, s.held, { binds: false, missing: [c.id] })
  confirm(s, c, X)
  run('every person in it has signed: it binds and each promise is reduced', X, s.held, { binds: true, why: null, missing: [], lines: [{ ok: true, owed: { minor: 1000 }, reduce: { minor: 1000 }, left: { minor: 0 } }, { ok: true }, { ok: true }] })
  // a partial circle: £400 of each
  const P = clear(lines([ab, M(400)], [bc, M(400)], [ca, M(400)]), 'part')
  for (const w of [a, b, c]) confirm(s, w, P)
  run('a part of each IOU: each is left with the rest', P, s.held, { binds: true, lines: [{ left: { minor: 600 } }, { left: { minor: 600 } }, { left: { minor: 600 } }] })
  // the signature of a stranger counts for nothing
  const Y = clear(lines([ab, M(100)], [bc, M(100)], [ca, M(100)]), 'stranger')
  confirm(s, finder, Y); confirm(s, a, Y); confirm(s, b, Y)
  run('the finder\'s own signature is not a member\'s', Y, s.held, { binds: false, missing: [c.id] })
  // more than is owed
  const Z = clear(lines([ab, M(1500)]), 'too much')
  run('a line that reduces more than is still owed does not stand', Z, s.held, { binds: false, lines: [{ ok: false }] })
  // a payment already made leaves less to clear
  const pay = s.say(a, 'transfer', { money: M(700) }, { what: ab.hash, to_owner: b.id, for: ab.hash })
  s.say(b, 'transfer', { status: 'accepted' }, { answers: pay.hash, for: ab.hash, after: [pay.hash] })
  const R = clear(lines([ab, M(500)]), 'after a payment')
  run('what was paid is not owed again: £300 is left of the first IOU, so £500 is too much', R, s.held, { binds: false, lines: [{ ok: false, owed: { minor: 300 } }] })
  // not accepted: not a deal
  const open = s.say(a, 'promise', { what: 'IOU', terms: { price: M(100) } }, { from: b.id, to: a.id })
  run('a promise nobody accepted binds nothing, so it clears nothing', clear(lines([open, M(100)])), s.held, { binds: false, lines: [{ ok: false }] })
  run('a block that is no deal', clear(lines([{ hash: '7'.repeat(64) }, M(100)])), s.held, { binds: false, lines: [{ ok: false }] })
  run('a block that is no clearing', ab, s.held, { binds: false })
  // kinds: the same kind only, unless a rate both sides signed is named
  const voucher = (n) => ({ value: String(n), unit: 'voucher' })
  const v1 = s.say(a, 'promise', { what: 'IOU', terms: { price: voucher(10) } }, { from: b.id, to: a.id }); accept(s, b, v1)
  const K1 = clear(lines([v1, voucher(4)]))
  confirm(s, a, K1); confirm(s, b, K1)
  run('a voucher IOU is cleared by vouchers, in its own kind', K1, s.held, { binds: true, lines: [{ ok: true, owed: { value: '10', unit: 'voucher' }, left: { value: '6', unit: 'voucher' } }] })
  const K2 = clear(lines([ab, voucher(2)]))
  run('pounds cleared by vouchers need a rate: with none named it does not stand', K2, s.held, { binds: false, lines: [{ ok: false }] })
  const rate = s.say(a, 'observe', { kind: 'rate', give: voucher(2), get: M(500) }, {})
  const K3 = clear(lines([ab, voucher(2), { applies: M(500), rate: rate.hash }]))
  run('a rate only one side signed does not stand', K3, s.held, { binds: false, lines: [{ ok: false }] })
  confirm(s, b, rate)
  const K4 = clear(lines([ab, voucher(2), { applies: M(500), rate: rate.hash }]))
  run('with the rate both sides signed, but £5 is more than the £3 left owed', K4, s.held, { binds: false, lines: [{ ok: false }] })
  const ca2 = iou(c, a, M(1000))
  const rate2 = s.say(c, 'observe', { kind: 'rate', give: voucher(2), get: M(500) }, {}); confirm(s, a, rate2)
  const K5 = clear(lines([ca2, voucher(4), { applies: M(1000), rate: rate2.hash }]))
  confirm(s, a, K5); confirm(s, c, K5)
  run('with the rate both sides signed, 4 vouchers clear £10', K5, s.held, { binds: true, lines: [{ ok: true, left: { minor: 0 } }] })
  const K6 = clear(lines([ca2, voucher(4), { applies: M(900), rate: rate2.hash }]))
  run('an amount applied that is not the rate\'s worth of the amount reduced does not stand', K6, s.held, { binds: false, lines: [{ ok: false }] })
}

// ---- Rulings: a stake that names a ruling by a named judge ----
{
  const s = story(), dep = s.person('ru-depositor'), bene = s.person('ru-bene'), judge = s.person('ru-judge'), robot = s.person('ru-robot', { kind: 'agent' }), rival = s.person('ru-rival')
  const trade = s.say(dep, 'promise', { what: 'the order', terms: { price: M(5000) } }, { from: bene.id, to: dep.id }); accept(s, bene, trade)
  const stake = (by, awards, amount = M(5000)) => { const p = s.say(dep, 'promise', { what: 'deposit', terms: { price: amount, condition: { ruled: trade.hash, by, awards } } }, { from: dep.id, to: bene.id }); accept(s, bene, p); return p }
  const deposit = stake(judge.id, bene.id)
  const rules = (who, awards, extra = {}) => s.say(who, 'observe', { kind: 'ruling', text: 'what happened', awards, ...extra }, { subject: trade.hash })
  const run = (name, st, held, expect, now = null) => door(`ruling: ${name}`, 'ruling_releases', [st, held, now], { expect, invariants: [36] })
  run('no ruling yet releases nothing', deposit, s.held, { releases: false, to: null, money: null })
  const wrong = rules(rival, [{ to: bene.id, money: M(5000) }])
  run('a ruling by someone else is no ruling by the judge named', deposit, s.held, { releases: false })
  const r1 = rules(judge, [{ to: bene.id, money: M(3000) }, { to: dep.id, money: M(2000) }])
  run('the judge awards the beneficiary £30 of the £50: £30 is released', deposit, s.held, { releases: true, to: bene.id, money: { minor: 3000 }, ruling: r1.hash, why: null })
  holds('condition ruled: the standard reading agrees once the ruling is dated', { ruled: trade.hash, by: judge.id, awards: bene.id }, s.held, NOW, true)
  holds('condition ruled: and not for a person it awards nothing to', { ruled: trade.hash, by: judge.id, awards: rival.id }, s.held, NOW, false)
  holds('condition ruled: nor before the judge signed it by the reader\'s clock', { ruled: trade.hash, by: judge.id, awards: bene.id }, s.held, '2020-01-01T00:00:00.000Z', false)
  holds('condition ruled: a ruling counts for the judge it is backed by: the rival, named as judge, has ruled too', { ruled: trade.hash, by: rival.id, awards: bene.id }, s.held, NOW, true)
  holds('condition ruled: written wrong holds for nothing', { ruled: trade.hash, by: judge.id }, s.held, NOW, false)
  run('the same ruling releases nothing to the depositor\'s condition', stake(judge.id, rival.id), s.held, { releases: false })
  const dep2 = stake(judge.id, dep.id)
  run('a stake that names the depositor as the one awarded is released by the same ruling: £20', dep2, s.held, { releases: true, to: dep.id, money: { minor: 2000 } })
  const r2 = rules(judge, [{ to: bene.id, money: M(9000) }])
  run('a later ruling that has seen the first replaces it; the award is capped at the stake', deposit, s.held, { releases: true, money: { minor: 5000 }, ruling: r2.hash })
  const r3 = rules(judge, [{ to: dep.id }])
  run('and a third that awards the beneficiary nothing releases nothing', deposit, s.held, { releases: false, ruling: null })
  // a ruling with no money states the whole stake
  const s2 = story(), d2 = s2.person('ru2-d'), b2 = s2.person('ru2-b'), j2 = s2.person('ru2-j')
  const t2 = s2.say(d2, 'promise', { what: 'order', terms: { price: M(1000) } }, { from: b2.id, to: d2.id }); accept(s2, b2, t2)
  const st2 = s2.say(d2, 'promise', { what: 'deposit', terms: { price: M(1000), condition: { ruled: t2.hash, by: j2.id, awards: b2.id } } }, { from: d2.id, to: b2.id }); accept(s2, b2, st2)
  s2.say(j2, 'observe', { kind: 'ruling', awards: [{ to: b2.id }] }, { subject: t2.hash })
  door('ruling: an award that states no amount releases the whole stake', 'ruling_releases', [st2, s2.held, null], { expect: { releases: true, money: { minor: 1000 } }, invariants: [36] })
  // another kind is never converted
  const s3 = story(), d3 = s3.person('ru3-d'), b3 = s3.person('ru3-b'), j3 = s3.person('ru3-j')
  const t3 = s3.say(d3, 'promise', { what: 'order', terms: { price: M(1000) } }, { from: b3.id, to: d3.id }); accept(s3, b3, t3)
  const st3 = s3.say(d3, 'promise', { what: 'deposit', terms: { price: M(1000), condition: { ruled: t3.hash, by: j3.id, awards: b3.id } } }, { from: d3.id, to: b3.id }); accept(s3, b3, st3)
  s3.say(j3, 'observe', { kind: 'ruling', awards: [{ to: b3.id, amount: { value: '4', unit: 'voucher' } }] }, { subject: t3.hash })
  door('ruling: an award in another kind than the stake releases nothing: nothing is converted', 'ruling_releases', [st3, s3.held, null], { expect: { releases: false }, invariants: [36] })
  // escrow: a transfer with the same condition; and an AI judge both named
  const s4 = story(), d4 = s4.person('ru4-d'), b4 = s4.person('ru4-b'), ai = s4.person('ru4-ai', { kind: 'agent' }), holder = s4.person('ru4-holder')
  const t4 = s4.say(d4, 'promise', { what: 'order', terms: { price: M(800) } }, { from: b4.id, to: d4.id }); accept(s4, b4, t4)
  const esc = s4.say(d4, 'transfer', { money: M(800), condition: { ruled: t4.hash, by: ai.id, awards: b4.id } }, { what: t4.hash, to_owner: b4.id, for: t4.hash })
  door('ruling: escrow is a transfer with the same condition: with no ruling, nothing', 'ruling_releases', [esc, s4.held, null], { expect: { releases: false }, invariants: [36] })
  s4.say(ai, 'observe', { kind: 'ruling', text: 'the goods arrived two days late', awards: [{ to: b4.id, money: M(300) }] }, { subject: t4.hash })
  door('ruling: an autonomous judge both chose rules, and £3 of the £8 escrow is released', 'ruling_releases', [esc, s4.held, null], { expect: { releases: true, to: b4.id, money: { minor: 300 } }, invariants: [36] })
  door('ruling: a block that is no stake', 'ruling_releases', [t4, s4.held, null], { expect: { releases: false }, invariants: [36] })
  // a judge's published offer is a promise under the schema judging: price, what, how fast
  const P = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../spec/schemas/published.json'), 'utf8')), J = P.schemas.judging
  const au = 'a'.repeat(64)
  const offerState = (extra = {}, terms = {}) => ({ seq: 1, at: '2026-12-01T00:00:00.000Z', audience: 'public', what: 'disputes over a delivery of food, up to £5000', terms: { price: M(5000), rules_within: 'P14D', ...terms }, ...extra })
  const offerRefs = { author: au, prev: au, from: au, schema: J.hash }
  const closed = (name, state, refs, held, codes) => door(name, 'refusals', ['promise', state, refs, held, [J]], { expect: codes.map((code) => ({ code })), exact: false, invariants: [36] })
  closed('judging: a judge\'s offer names her price, what she judges and how fast: nothing to refuse', offerState(), offerRefs, [J], [])
  closed('judging: a term the schema does not declare is refused', offerState({}, { colour: 'red' }), offerRefs, [J], ['undeclared_field'])
  // whether her rulings are public is the typed term `terms.rulings` of her signed offer; left out means private (promises.md, Rulings)
  const visible = (name, offerTerms, awardExtra, now, expect) => {
    const v = story(), d = v.person(`ra-${name.length}-d`), b = v.person(`ra-${name.length}-b`), jd = v.person(`ra-${name.length}-j`)
    const deal = v.say(d, 'promise', { what: 'the order', terms: { price: M(5000) } }, { from: b.id, to: d.id }); accept(v, b, deal)
    v.say(jd, 'promise', { what: 'disputes over a delivery of food', terms: { price: M(500), rules_within: 'P14D', ...offerTerms } }, { from: jd.id, schema: J.hash })
    const r = v.say(jd, 'observe', { kind: 'ruling', text: 'what happened', awards: [{ to: b.id, money: M(3000), ...awardExtra }] }, { subject: deal.hash })
    door(`judging: ${name}`, 'ruling_audience', [r, [P.genesis, ...P.order.map((n) => P.schemas[n]), ...v.held], now], { expect, exact: true, invariants: [36] })
  }
  visible('an offer that says rulings public makes the ruling public', { rulings: 'public' }, {}, null, { audience: 'public', why: 'the judge\'s offer says her rulings are public' })
  visible('an offer with no rulings term leaves the ruling private', {}, {}, null, { audience: 'private', why: 'the judge\'s offer does not say her rulings are public' })
  visible('an offer that says anything but public leaves the ruling private', { rulings: 'sometimes' }, {}, null, { audience: 'private', why: 'the judge\'s offer does not say her rulings are public' })
  visible('a private offer and an unhonoured ruling: the ruling is public', {}, { due: '2027-01-01T00:00:00.000Z' }, '2027-02-01T00:00:00.000Z', { audience: 'public', why: 'an award of the ruling is unpaid past its due date' })
  visible('a private offer and an award not yet due: the ruling stays private', {}, { due: '2027-01-01T00:00:00.000Z' }, '2026-12-01T00:00:00.000Z', { audience: 'private', why: 'the judge\'s offer does not say her rulings are public' })
  // her own signed release of the ruling counts as honoured (promises.md, A release): only hers, or one who speaks for her under her grant
  const settled = (name, signer, expect) => {
    const v = story(), d = v.person('rs-d'), b = v.person('rs-b'), jd = v.person('rs-j'), bot = v.person('rs-bot', { kind: 'agent' })
    const deal = v.say(d, 'promise', { what: 'the order', terms: { price: M(5000) } }, { from: b.id, to: d.id }); accept(v, b, deal)
    v.say(jd, 'promise', { what: 'disputes over a delivery of food', terms: { price: M(500), rules_within: 'P14D' } }, { from: jd.id, schema: J.hash })
    const r = v.say(jd, 'observe', { kind: 'ruling', text: 'what happened', awards: [{ to: b.id, money: M(3000), due: '2027-01-01T00:00:00.000Z' }] }, { subject: deal.hash })
    const g = v.say(b, 'grant', { kind: 'agent', scope: { acts: ['observe.release'], parties: [], until: '2030-01-01T00:00:00.000Z' } }, { to: bot.id })
    const who = { awardee: [b, {}], loser: [d, {}], agent: [bot, { under: g.hash }] }[signer]
    v.say(who[0], 'observe', { kind: 'release', text: 'paid me in cash, we are settled' }, { subject: r.hash, ...who[1] })
    door(`judging: ${name}`, 'ruling_audience', [r, [P.genesis, ...P.order.map((n) => P.schemas[n]), ...v.held], '2027-02-01T00:00:00.000Z'], { expect, exact: true, invariants: [36] })
  }
  settled('an award past due, settled by a release signed by the awardee: the ruling is private', 'awardee', { audience: 'private', why: 'the judge\'s offer does not say her rulings are public' })
  settled('the same release signed by the loser counts for nothing: the ruling is public', 'loser', { audience: 'public', why: 'an award of the ruling is unpaid past its due date' })
  settled('the same release signed by the awardee\'s agent under her grant: private', 'agent', { audience: 'private', why: 'the judge\'s offer does not say her rulings are public' })
}

// ---- Groups: a circle founded, joined, pooled and left, with what she owes after ----
{
  const s = story(), founder = s.person('gr-founder'), amara = s.person('gr-amara'), ben = s.person('gr-ben')
  const roles = [{ name: 'member', powers: ['sign', 'admit', 'remove'] }]
  const group = s.say(founder, 'actor', { kind: 'circle', name: 'Lake co-op', roles, removal: { needed: 1 } }, {})
  const join = (who) => { const g = s.say(founder, 'grant', { kind: 'member', roles: ['member'] }, { subject: group.hash, as: group.hash, to: who.id }); s.say(who, 'grant', { status: 'accepted' }, { answers: g.hash, after: [g.hash] }); return g }
  const ga = join(amara), gb = join(ben)
  const members = (blocks) => call('circle_state', group.hash, blocks, null).members
  const names = (blocks) => Object.keys(members(blocks) || {}).sort()
  assert.deepEqual(names(s.held), [founder.id, amara.id, ben.id].sort())
  door('groups: a circle founded by one block, two joined by their own accepts', 'circle_state', [group.hash, s.held, null], { expect: { founder: founder.id }, invariants: [27] })
  // what she pooled is her own signed promise to the circle; what she owes after leaving is only that
  const dues = s.say(amara, 'promise', { what: 'dues for a year', terms: { price: M(1200) } }, { from: group.hash, to: amara.id })
  accept(s, founder, dues, { as: group.hash })
  // she leaves with one block: her own stop of her member grant
  const before = s.held.slice()
  s.say(amara, 'grant', { status: 'stopped', stop: 'onward' }, { updates: ga.hash, after: [ga.hash] })
  assert.deepEqual(names(s.held), [founder.id, ben.id].sort(), 'one block of hers and she is out')
  assert.deepEqual(names(before), [founder.id, amara.id, ben.id].sort())
  door('groups: leaving is one block, needing no power and no quorum: she is no longer a member', 'may_act_as', [s.say(amara, 'observe', { kind: 'message', text: 'after I left' }, { as: group.hash }), group.hash, s.held, null], { expect: false, exact: true, invariants: [27] })
  door('groups: what she signed before leaving still stands: the dues are still owed to the circle', 'promise_stage', [dues, s.held, {}], { expect: { stage: 'accepted', total: { minor: 1200, currency: 'GBP' } } })
  // the group cannot add a term after: a promise it writes with her as a side, that she never accepted, binds nothing
  const added = s.say(founder, 'promise', { what: 'an exit fee', terms: { price: M(5000) } }, { from: group.hash, to: amara.id, as: group.hash })
  door('groups: a term the group adds after she left binds no one: she never signed it', 'promise_stage', [added, s.held, {}], { expect: { stage: 'offered' } })
}

// ---- Vouchers: an IOU or a voucher issued and passed on as a claim ----
{
  const s = story(), cafe = s.person('vo-cafe'), ana = s.person('vo-ana'), bo = s.person('vo-bo')
  // an IOU in money: the issuer asks (to = the issuer), the first holder accepts; the price is what the issuer owes her
  const v = s.say(cafe, 'promise', { what: 'an IOU for five pounds', terms: { price: M(500) } }, { from: ana.id, to: cafe.id }); accept(s, ana, v)
  door('voucher: an IOU issued by its signer and accepted by its first holder: £5 owed to her, and no one else stands behind it', 'promise_stage', [v, s.held, {}], { expect: { stage: 'accepted', total: { minor: 500, currency: 'GBP' }, sides: { from: ana.id, to: cafe.id } } })
  const pass = s.say(ana, 'transfer', {}, { what: v.hash, to_owner: bo.id, for: v.hash })
  s.say(bo, 'transfer', { status: 'accepted' }, { answers: pass.hash, for: v.hash, after: [pass.hash] })
  door('voucher: passed on as a claim (the hand-over, accepted): the new holder is the one owed', 'promise_stage', [v, s.held, {}], { expect: { owed: { from: [{ owner: bo.id, money: { minor: 500 } }] } }, invariants: [32] })
  const X = s.say(cafe, 'observe', { kind: 'clearing', lines: [{ deal: v.hash, reduce: M(200) }] }, {})
  confirm(s, ana, X)
  door('voucher: a clearing of a passed IOU is signed by the holder now, not the first holder', 'clearing_applied', [X, s.held], { expect: { binds: false, missing: [bo.id] } })
  // a bearer voucher: a thing the issuer makes, which the issuer promises to honour for whoever owns it; passing it is an ordinary transfer of the thing
  const coffee = s.say(cafe, 'thing', { kind: 'coffee' }, {})
  const note = s.say(cafe, 'thing', { kind: 'voucher', name: 'five coffees' }, { of: coffee.hash })
  const honour = s.say(cafe, 'promise', { what: 'five coffees to whoever holds the voucher', terms: { quantity: { value: '5', unit: 'coffee' } } }, { from: cafe.id, to: note.hash, what: coffee.hash })
  const give = s.say(cafe, 'transfer', {}, { what: note.hash, to_owner: ana.id })
  s.say(ana, 'transfer', { status: 'accepted' }, { answers: give.hash, after: [give.hash] })
  door('voucher: a bearer voucher issued to Ana is owned by her', 'ownership', [note, s.held, null], { expect: { owner: ana.id } })
  const on = s.say(ana, 'transfer', {}, { what: note.hash, to_owner: bo.id })
  s.say(bo, 'transfer', { status: 'accepted' }, { answers: on.hash, after: [on.hash] })
  door('voucher: passed on, it is Bo\'s, and the issuer\'s promise goes to whoever holds it', 'ownership', [note, s.held, null], { expect: { owner: bo.id } })
}


// ---- Act templates: the terms a deal of lists and conditions carries (promises.md, An act is a template of the one shape) ----
{
  const s = story(), co = s.person('at-coop'), buyer = s.person('at-buyer'), judge = s.person('at-judge')
  const move = (type) => ({ type, tie: 'none', sides: 'mine to theirs', needs: [], words: ['what', 'terms'] })
  const tpl = (takes, needs = []) => s.say(co, 'thing', { kind: 'act', name: 'A boxed order with a deposit', words: 'A priced list.', sides: { from: 'the co-op', to: 'the buyer' }, takes, needs, record: { Promise: move('promise') } }, {})
  const eggs = s.say(co, 'thing', { kind: 'eggs' }, {})
  const deal = (t, terms) => s.raw(co, 'promise', { what: 'a box', terms }, { from: co.id, to: buyer.id, what: eggs.hash, act: t.hash }) // raw: the writer refuses a badly written list, and a template must still say so
  const lines = [{ id: 'a', what: eggs.hash, quantity: { value: '12', unit: 'egg' }, price: M(300) }]
  const cond = { ruled: eggs.hash, by: judge.id, awards: co.id }
  const T = tpl({ lines: 'lines', condition: 'condition', keepers: 'keepers', band: 'text', forfeit: 'money', backing: 'amount' }, ['lines'])
  const chk = (name, d, t, ok) => { const got = door(`act: ${name}`, 'act_check', [d, t], { expect: { ok }, invariants: [32] }); assert.equal(typeof got.why, ok ? 'object' : 'string') }
  chk('a template may take a priced list, a condition, a named clock, a band, a forfeit and a backing', deal(T, { lines, condition: cond, keepers: { names: [judge.id] }, band: '0.05', forfeit: M(100), backing: { value: '2', unit: 'heifer' } }), T, true)
  chk('a list of lines with no id is not a list the template takes', deal(T, { lines: [{ what: eggs.hash }] }), T, false)
  chk('a list with a key a line has not is refused', deal(T, { lines: [{ id: 'a', colour: 'red' }] }), T, false)
  chk('an empty list is no list', deal(T, { lines: [] }), T, false)
  chk('a condition of a shape the protocol reads', deal(T, { lines, condition: { signal: 'rain', by: [judge.id] } }), T, true)
  chk('an object with no shape the protocol reads is no condition', deal(T, { lines, condition: { when: 'rain' } }), T, false)
  chk('a clock with no names is no clock', deal(T, { lines, keepers: { names: [] } }), T, false)
  chk('a clock with a key a clock has not', deal(T, { lines, keepers: { names: [judge.id], boss: 1 } }), T, false)
  const W = tpl({ lines: 'list' })
  chk('a type the protocol does not read is not whole', deal(W, {}), W, false)
}

vectorsFile.save(V, tags)
console.log(`${kit.made.size} cases written to ${require('path').relative(process.cwd(), vectorsFile.FILE)}`)
