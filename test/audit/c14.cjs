// Case 14: a pot (folds.md, A pot): a vouch's backing, and a pool with pay-ins and payouts. The core and the oracle must read it alike.
const { World } = require('./lib.cjs')
const w = new World('case14 a pot')
const mo = w.person('mo'), coop = w.person('coop'), ann = w.person('ann'), bea = w.person('bea'), vet = w.person('vet')
const vouch = w.w(mo, 'promise', { what: 'stands behind Jide', terms: { backing: { minor: 10000, currency: 'GBP' }, until: '2027-12-31T00:00:00.000Z' } }, { from: mo.id, to: coop.id }, 'Mo vouches for up to 100')
const pay = (who, to, head, minor, state = {}, refs = {}, note) => {
  const t = w.w(who, 'transfer', { money: { minor, currency: 'GBP' }, ...state }, { to_owner: to.id, for: head.hash, ...refs }, note)
  w.w(to, 'transfer', { status: 'accepted' }, { answers: t.hash }, note + ' accepted')
  return t
}
pay(mo, coop, vouch, 6000, {}, {}, 'Mo pays 60')
pay(mo, coop, vouch, 6000, {}, {}, 'Mo pays 60 more, past the cap')
const pool = w.w(ann, 'promise', { what: 'a pool', terms: { until: '2027-12-31T00:00:00.000Z' } }, { from: ann.id }, 'Ann holds a pool')
const a = pay(bea, ann, pool, 5000, {}, {}, 'Bea pays in 50')
pay(ann, bea, pool, 3000, { condition: { signal: 'cow_died', by: [vet.id], signers: 1, subject: bea.id } }, { after: [a.hash] }, 'Ann pre-signs a payout')
w.w(vet, 'observe', { kind: 'cow_died' }, { subject: bea.id }, 'the vet signs')
w.report()
module.exports = { w }
