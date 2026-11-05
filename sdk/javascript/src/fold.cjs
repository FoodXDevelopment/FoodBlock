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
/** The occurrences of a standing promise's calendar repeat (promises.md, Terms: repeat) from `from` up to, not including, `to`: UTC start times, each the name of an occurrence.
 * Counted from `state.when`, read in `terms.zone` by the IANA database the core bundles. Throws for a repeat that follows an event, another calendar, or a part it does not read. */
const repeatOccurrences = (promise, from, to) => door.repeatOccurrences(promise, from, to)
/** A circle's members and roles. Options: `within` (a block: fold only its causal past). */
const circleState = (circle, blocks, { within } = {}) => door.circleState(idOf(circle), blocks, within || null)
const mayActAs = (block, circle, blocks, role) => door.mayActAs(block, idOf(circle), blocks, role || null)
/** The one party a fold counts `block` for (authority.md, Who a block speaks for): an id, or null when it speaks for no one. `block` need not be among `blocks` yet; no clock is read. */
const speaksFor = (block, blocks) => door.speaksFor(block, blocks)
/** Is `block` backed by `person` (authority.md, Backed by a person)? `{ backed, why, chain }`: `why` is a plain sentence when not (null when backed), `chain` the hashes from the block down to the block the person signed. `person` is an id or a block; no clock, no arrival. */
const backed = (block, person, blocks) => door.backed(block, idOf(person), blocks)
/** `backed` for a whole set at once: `{ [hash]: { backed, why } }` for every block of `blocks`, each the verdict `backed` gives it among the same blocks, read together (one pass over the store, not one per block). `person` is an id or a block. */
const backedAll = (person, blocks) => door.backedAll(idOf(person), blocks)
/** Money moved in `person`'s name that they do not back (promises.md, What is owed back): `{ owed: [{ block, minor, currency, to, why }] }`, one line for each transfer whose money is theirs by `gives` and that `backed` says they do not back. `person` is an id or a block. */
const owedBack = (person, blocks) => door.owedBack(idOf(person), blocks)
/** What of `person`'s would become whose if `block` stands (promises.md, What becomes whose): `{ gives: [{ of: 'money' | 'goods' | 'use', to, back, ... }] }`, read only from the block's typed terms and refs, never from any template's words. `back` is the time it comes back, or null (it cannot be counted on to). `person` is an id or a block. */
const gives = (block, person, blocks) => door.gives(block, idOf(person), blocks)
/** A deal against the act template it names (promises.md, An act is a template of the one shape): `{ ok, why }`, `why` one plain sentence when not ok (null when it is). */
const actCheck = (deal, template) => door.actCheck(deal, template)
const membersThen = door.membersThen
const ownership = (instance, blocks, now) => door.ownership(blockOf(instance), blocks, now)
const ownerOf = (instance, blocks) => door.ownerOf(blockOf(instance), blocks)
const receiverOf = door.receiverOf
const whereNow = (thing, blocks) => door.whereNow(blockOf(thing), blocks)
const sharesOn = (thing, blocks) => door.sharesOn(blockOf(thing), blocks)
const notFreeShown = (block, blocks) => door.notFreeShown(blockOf(block), blocks)
const invasionShown = (claim, blocks) => door.invasionShown(blockOf(claim), blocks)
const pot = (head, blocks, now) => door.pot(blockOf(head), blocks, now)
/** Where `who` says money to them goes (promises.md, Where to pay me): `{ who, destination, hash, at }` from their own newest account word, or null. */
const accountOf = (who, blocks) => door.accountOf(idOf(who), blocks)
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

module.exports = { repeatOccurrences, promiseStage, promiseView, promiseViews, circleState, mayActAs, speaksFor, backed, backedAll, owedBack, gives, actCheck, membersThen, ownership, ownerOf, receiverOf, whereNow, sharesOn, notFreeShown, invasionShown, pot, accountOf, releaseShown, bidsShown, useShown, consent, liveGrant, withdrawalSeen, due, recoveryReach, successorView, circleKey, countedIn }
