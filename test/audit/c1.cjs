// Case 1, a coffee shop, in 1.9 circles (changes-1.9/06-circles.md): Alice founds the café with 100 parts and one row (any one part holder
// signs up to the café's types); she hands Bob 10 parts, so Bob is an owner whose row holds alone (1.7's "manager with the sign power").
// Carol owns no part and holds no grant: an outsider. The café's vouchers are things made `as` the café (rule 2), not its parts.
const { fb, oracle, World } = require('./lib.cjs')
const { call } = require('../../sdk/javascript/src/core.cjs')
const w = new World('case1 coffee shop')
const alice = w.person('alice'), bob = w.person('bob'), carol = w.person('carol'), pay = w.person('payprovider', 'agent')
const show = (n, ...a) => console.log('>>', n, ...a.map(x => typeof x === 'string' ? x : JSON.stringify(x)))
const part = (n) => ({ value: String(n), unit: 'part' })
const row = { parts: 1, scope: { types: ['promise', 'transfer', 'transform', 'observe', 'thing', 'grant'] } }
const cafe = w.w(alice, 'actor', { kind: 'circle', name: 'Cafe', pack: part(100), rules: [row] }, {}, 'circle')
// Bob takes 10 parts: Alice's transfer and his yes
const bp = w.w(alice, 'transfer', { amount: part(10) }, { what: cafe.hash, to_owner: bob.id }, 'alice hands bob 10 parts')
w.w(bob, 'transfer', { status: 'accepted' }, { answers: bp.hash }, 'bob accepts his parts')
show('circle', call('circle_state', cafe.hash, w.blocks, null))
// vouchers: a kind and 100 instances, made as the cafe by bob under the row
const shareKind = w.w(bob, 'thing', { kind: 'share', name: 'Cafe share' }, { as: cafe.hash }, 'share kind (bob as cafe)')
const mint = w.w(bob, 'transform', { kind: 'mint' }, { as: cafe.hash }, 'transform: mint 100 shares (no inputs)')
const shares = []
for (let i = 0; i < 100; i++) shares.push(w.w(bob, 'thing', { kind: 'share', marks: [{ scheme: 'lot', value: 'S' + i }] }, { of: shareKind.hash, derives_from: mint.hash, as: cafe.hash }, 'share ' + i))
show('100 shares written', shares.filter(s => !s.refusedWrite).length)
show('owner of share0 (maker bob as cafe) sdk', fb.ownerOf(shares[0], w.blocks), 'oracle', oracle.ownershipFold(shares[0], w.blocks))
// offer
const offer = w.w(bob, 'promise', { terms: { price: { amount: { value: '5', unit: 'GBP' }, per: { value: '1', unit: 'share' } }, quantity: { value: '5', unit: 'share' }, expires: '2026-12-01T00:00:00.000Z' } }, { from: cafe.hash, to: carol.id, what: shareKind.hash, as: cafe.hash }, 'offer 5 shares (bob as cafe) -> carol')
const acc = w.w(carol, 'promise', { status: 'accepted', terms: { quantity: { value: '5', unit: 'share' } } }, { answers: offer.hash, for: offer.hash }, 'carol accepts')
show('stage after accept', fb.promiseStage(offer, w.blocks), oracle.door('promise_stage', offer, w.blocks))
const payment = w.w(carol, 'transfer', { amount: { value: '25', unit: 'GBP' }, marks: [{ scheme: 'upi', value: 'REF123' }] }, { to_owner: cafe.hash, for: offer.hash }, 'carol pays 25 GBP')
w.w(pay, 'observe', { kind: 'payment', text: 'upi callback' }, { confirms: payment.hash, derives_from: fb.hash('observe', { raw: 'cb' }, {}) }, 'provider confirms payment')
w.w(bob, 'transfer', { kind: 'receipt-ack', status: 'accepted' }, { answers: payment.hash, for: offer.hash }, 'XX bob (not as cafe) accepts payment', {})
show('stage after payment (unaccepted by cafe)', fb.promiseStage(offer, w.blocks).stage)
const pa = w.w(bob, 'transfer', { status: 'accepted' }, { answers: payment.hash, for: offer.hash, as: cafe.hash }, 'cafe accepts payment (bob as cafe)')
show('stage after payment accepted', fb.promiseStage(offer, w.blocks).stage, 'paid', fb.promiseStage(offer, w.blocks).paid, 'row_holds', call('row_holds', pa, w.blocks))
// share transfer: 1 transfer of 5 instances
const give = shares.slice(0, 5).map(s => s.hash).sort()
const tr = w.w(bob, 'transfer', { }, { what: give, to_owner: carol.id, for: offer.hash, as: cafe.hash }, 'transfer 5 shares to carol (bob as cafe)')
show('stage after transfer unaccepted', fb.promiseStage(offer, w.blocks).stage)
w.w(carol, 'transfer', { status: 'accepted' }, { answers: tr.hash, for: offer.hash }, 'carol accepts shares')
const st = fb.promiseStage(offer, w.blocks), so = oracle.door('promise_stage', offer, w.blocks)
show('stage after shares accepted', st.stage, so.stage, JSON.stringify(st.lines), JSON.stringify(st.total), JSON.stringify(st.paid))
for (const s of shares.slice(0, 6)) show('owner', s.state.marks[0].value, (fb.ownerOf(s, w.blocks) || 'null').slice(0, 6), (oracle.ownershipFold(s, w.blocks).owner || 'null').slice(0, 6))
show('ids: alice', alice.id.slice(0, 6), 'cafe', cafe.hash.slice(0, 6), 'carol', carol.id.slice(0, 6))
w.report()
module.exports = { w }
