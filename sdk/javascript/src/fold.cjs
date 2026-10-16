// The folds and views (modules/folds.md): a set of blocks read into one answer, the same on every node from the same
// blocks; a view adds the reader's clock or arrivals. The rules run in the Rust core.
const { call, list, arrivals } = require('./core.cjs')

// A circle, or a thing, may be given as its block or as its hash.
const idOf = (x) => (x && x.hash) || x
const blockOf = (x) => (typeof x === 'string' ? { hash: x } : x)

/** A promise's stage, from its first promise and every block in its deal. No clock. Option: `confirmers`. */
const promiseStage = (firstBlock, blocks, { confirmers = [] } = {}) => call('promise_stage', firstBlock, list(blocks), { confirmers })
/** The view: the same answer, with stage `expired` once the reader's `now` passes `expires` and nothing binds. */
const promiseView = (firstBlock, blocks, { now, confirmers = [] } = {}) => call('promise_view', firstBlock, list(blocks), { now, confirmers })
/** A circle's members and roles. Options: `within` (a block: fold only its causal past). */
const circleState = (circle, blocks, { within } = {}) => call('circle_state', idOf(circle), list(blocks), within || null)
const mayActAs = (block, circle, blocks, role) => call('may_act_as', block, idOf(circle), list(blocks), role || null)
const membersThen = (block, recipient, blocks) => call('members_then', block, recipient, list(blocks))
const ownership = (instance, blocks) => call('ownership', blockOf(instance), list(blocks))
const ownerOf = (instance, blocks) => call('owner_of', blockOf(instance), list(blocks))
const receiverOf = (promise, blocks) => call('receiver_of', promise, list(blocks))
const whereNow = (thing, blocks) => call('where_now', blockOf(thing), list(blocks))
const orderer = (record) => call('orderer_of', record)
/** The consent fold: a person's live word about a sender (or none): { word, block }. `under`: the grant the sender's block acts under; a word about its grantor is a word about the sender (consent follows the principal). */
const consent = (person, sender, blocks, under) => call('consent', person, sender || null, list(blocks), under || null)
// Views, each saying whose clock or arrivals it reads.
const liveGrant = (act, grants, now) => call('live_grant', act, list(grants), now)
const withdrawalSeen = (withdrawal, block, blocks, { arrivedAt } = {}) => call('withdrawal_seen', withdrawal, block, list(blocks), arrivals(arrivedAt, blocks, [withdrawal, block]))
const due = (promise, { arrivedAt } = {}) => call('due', promise, arrivals(arrivedAt, [promise], list(promise && promise.state && promise.state.when && promise.state.when.after ? [{ hash: promise.state.when.after }] : [])))
const recoveryReach = (rotation, blocks, { arrivedAt } = {}) => call('recovery_reach', rotation, list(blocks), arrivals(arrivedAt, blocks, [rotation]))
// The optional profiles (spec/profiles).
const successorView = (grant, blocks, { now, arrivedAt } = {}) => call('successor_view', grant, list(blocks), now || null, arrivals(arrivedAt, blocks))
const circleKey = (circle, blocks) => call('circle_key', idOf(circle), list(blocks))
const countedIn = (result, commitment, counter) => call('counted_in', result ?? null, String(commitment), String(counter))

module.exports = { promiseStage, promiseView, circleState, mayActAs, membersThen, ownership, ownerOf, receiverOf, whereNow, orderer, consent, liveGrant, withdrawalSeen, due, recoveryReach, successorView, circleKey, countedIn }
