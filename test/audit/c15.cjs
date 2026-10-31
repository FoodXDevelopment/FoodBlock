// Case 15: a congruence audit. A rule asked of everyone but its author is a privilege (no one rules by default, no one sits in the middle by
// privilege). FoodX's own offers, grants, signals and rulings run through the same folds as anyone's: the same scenes are built twice, once
// with an actor named "FoodX" in the author's place and once with a stranger's name, and the folds must give the same answers. If FoodX's
// blocks were exempt anywhere, the two would differ and the audit fails (run.cjs).
const { World } = require('./lib.cjs')
const worlds = {}
const scene = (name) => {
  const w = new World('case15 congruence: ' + name)
  const house = w.person(name), una = w.person('una'), helper = w.person('helper'), judge = w.person('judge')
  const eggs = w.w(house, 'thing', { kind: 'eggs' }, {}, `${name} eggs`)
  const offer = w.w(house, 'promise', { terms: { price: { minor: 800, currency: 'GBP' } } }, { from: house.id, to: una.id, what: eggs.hash }, `${name} offers eggs`)
  w.w(una, 'promise', { status: 'accepted' }, { answers: offer.hash, for: offer.hash, after: [offer.hash] }, 'Una accepts')
  // its own defeats of a block of its own deal is a dispute at most, never a ruling (invariant 13)
  const pay = w.w(una, 'transfer', { money: { minor: 800, currency: 'GBP' } }, { to_owner: house.id, for: offer.hash }, 'Una pays')
  w.w(house, 'observe', { kind: 'ruling' }, { defeats: pay.hash, for: offer.hash }, `${name} defeats the payment`)
  // a grant of its own: a visible limit binds it like any grantor
  const grant = w.w(house, 'grant', { kind: 'act', scope: { acts: ['promise.purchase'], parties: [una.id], limit: { minor: 5000, currency: 'GBP' } } }, { to: helper.id }, `${name} grants its helper £50`)
  w.w(helper, 'grant', { status: 'accepted' }, { answers: grant.hash }, 'helper accepts')
  const small = w.w(helper, 'promise', { kind: 'purchase', terms: { price: { minor: 4000, currency: 'GBP' } } }, { from: una.id, to: house.id, what: eggs.hash, under: grant.hash }, 'helper orders £40')
  const big = w.w(helper, 'promise', { kind: 'purchase', terms: { price: { minor: 8000, currency: 'GBP' } } }, { from: una.id, to: house.id, what: eggs.hash, under: grant.hash }, 'helper orders £80')
  // its claim and its own judge: the claimant's judge is never the claimant
  const claim = w.w(house, 'observe', { kind: 'invasion', text: 'a crossing' }, { to: una.id, subject: eggs.hash }, `${name} claims`)
  const named = w.w(house, 'grant', { kind: 'referee', scope: { until: '2027-12-31T00:00:00.000Z' } }, { to: house.id, subject: claim.hash }, `${name} names itself judge`)
  const named2 = w.w(house, 'grant', { kind: 'referee', scope: { until: '2027-12-31T00:00:00.000Z' } }, { to: judge.id, subject: claim.hash }, `${name} names a judge`)
  w.w(judge, 'observe', { kind: 'ruling' }, { confirms: claim.hash, after: [named2.hash] }, 'judge confirms')
  // its signal counts once, like any signer's
  w.w(house, 'observe', { kind: 'ready', at: '2026-11-01T00:00:00.000Z' }, { subject: una.id }, `${name} signs ready`)
  w.w(house, 'observe', { kind: 'ready', at: '2026-11-02T00:00:00.000Z' }, { subject: una.id }, `${name} signs ready again`)
  void named
  worlds[name] = { w, house, una, helper, judge, offer, small, big, claim, eggs }
  return w
}
scene('FoodX')
scene('a stranger')
w_report: for (const k of Object.keys(worlds)) worlds[k].w.report()
module.exports = { worlds }
