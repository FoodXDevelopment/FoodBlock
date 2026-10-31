// The folds and views (modules/folds.md): a set of blocks read into one answer, the same on every node from the same
// blocks; a view adds the reader's clock or arrivals. The rules run in the Rust core.
const door = require('./door.cjs')
const { list, arrivals } = require('./core.cjs')

// A circle, or a thing, may be given as its block or as its hash.
const idOf = (x) => (x && x.hash) || x
const blockOf = (x) => (typeof x === 'string' ? { hash: x } : x)

/** A promise's stage, from its first promise and every block in its deal: a function of the blocks alone. No clock. */
const promiseStage = (firstBlock, blocks) => door.promiseStage(firstBlock, blocks, {})
/** The view: the same answer, with stage `expired` once the reader's `now` passes `expires` and nothing binds. */
const promiseView = (firstBlock, blocks, { now } = {}) => door.promiseView(firstBlock, blocks, { now })
/** The views of many deals of one store at once, read against one reading of it: { hash: view }. Each first promise is among `blocks`. */
const promiseViews = (firsts, blocks, { now } = {}) => door.promiseViews(list(firsts).map((f) => (typeof f === 'string' ? f : f.hash)), blocks, { now })
/** A circle's members and roles. Options: `within` (a block: fold only its causal past). */
const circleState = (circle, blocks, { within } = {}) => door.circleState(idOf(circle), blocks, within || null)
const mayActAs = (block, circle, blocks, role) => door.mayActAs(block, idOf(circle), blocks, role || null)
const membersThen = door.membersThen
const ownership = (instance, blocks, now) => door.ownership(blockOf(instance), blocks, now)
const ownerOf = (instance, blocks) => door.ownerOf(blockOf(instance), blocks)
const receiverOf = door.receiverOf
const whereNow = (thing, blocks) => door.whereNow(blockOf(thing), blocks)
const sharesOn = (thing, blocks) => door.sharesOn(blockOf(thing), blocks)
const notFreeShown = (block, blocks) => door.notFreeShown(blockOf(block), blocks)
const invasionShown = (claim, blocks) => door.invasionShown(blockOf(claim), blocks)
const pot = (head, blocks, now) => door.pot(blockOf(head), blocks, now)
const releaseShown = (subject, blocks) => door.releaseShown(blockOf(subject), blocks)
const bidsShown = (quarrel, blocks) => door.bidsShown(blockOf(quarrel), blocks)
const useShown = (place, blocks, keepers) => door.useShown(blockOf(place), blocks, keepers)
/** The consent fold: a person's live word about a sender (or none): { word, block }. `under`: the grant the sender's block acts under; a word about its grantor is a word about the sender (consent follows the principal). */
const consent = (person, sender, blocks, under) => door.consent(person, sender || null, blocks, under || null)
// Views, each saying whose clock or arrivals it reads.
const liveGrant = door.liveGrant
const withdrawalSeen = (withdrawal, block, blocks, { arrivedAt } = {}) => door.withdrawalSeen(withdrawal, block, blocks, arrivals(arrivedAt, blocks, [withdrawal, block]))
const due = (promise, { arrivedAt } = {}) => door.due(promise, arrivals(arrivedAt, [promise], list(promise && promise.state && promise.state.when && promise.state.when.after ? [{ hash: promise.state.when.after }] : [])))
const recoveryReach = (rotation, blocks, { arrivedAt, unknownArrival } = {}) => door.recoveryReach(rotation, blocks, arrivals(arrivedAt, blocks, [rotation]), unknownArrival)
// The optional profiles (spec/profiles).
const successorView = (grant, blocks, { now, arrivedAt } = {}) => door.successorView(grant, blocks, now || null, arrivals(arrivedAt, blocks))
const circleKey = (circle, blocks) => door.circleKey(idOf(circle), blocks)
const countedIn = (result, commitment, counter) => door.countedIn(result ?? null, String(commitment), String(counter))

module.exports = { promiseStage, promiseView, promiseViews, circleState, mayActAs, membersThen, ownership, ownerOf, receiverOf, whereNow, sharesOn, notFreeShown, invasionShown, pot, releaseShown, bidsShown, useShown, consent, liveGrant, withdrawalSeen, due, recoveryReach, successorView, circleKey, countedIn }
