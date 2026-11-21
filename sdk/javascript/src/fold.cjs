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
/** A circle's owners and rows. Options: `within` (a block: fold only its causal past). */
const circleState = (circle, blocks, { within } = {}) => door.circleState(idOf(circle), blocks, within || null)
/** The one party a fold counts `block` for (authority.md, Who a block speaks for): an id, or null when it speaks for no one. `block` need not be among `blocks` yet; no clock is read. */
const speaksFor = (block, blocks) => door.speaksFor(block, blocks)
/** Is `block` backed by `person` (authority.md, Backed by a person)? `{ backed, why, chain }`: `why` is a plain sentence when not (null when backed), `chain` the hashes from the block down to the block the person signed. `person` is an id or a block; no clock, no arrival. */
const backed = (block, person, blocks) => door.backed(block, idOf(person), blocks)
/** `backed` for a whole set at once: `{ [hash]: { backed, why } }` for every block of `blocks`, each the verdict `backed` gives it among the same blocks, read together (one pass over the store, not one per block). `person` is an id or a block. */
const backedAll = (person, blocks) => door.backedAll(idOf(person), blocks)
/** An amount moved in `person`'s name that they do not back (promises.md, What is to come back): `{ to_come: [{ block, amount, to, why }] }`, one line for each transfer whose amount is theirs by `gives` and that `backed` says they do not back. `person` is an id or a block. */
const toComeBack = (person, blocks) => door.toComeBack(idOf(person), blocks)
/** A list-keeper's answer against the lookup it answers (promises.md, Finding): `{ ok, why, bad: [{ hash, why }], left_out: [hash] }`. `ok` when every block the listing names is a real signed offer (or want) the lookup asks for: a keeper may leave one out, never make one up. */
const listingCheck = (lookup, listing, blocks) => door.listingCheck(lookup, listing, blocks)
/** A signed check of someone's record against the blocks it names (promises.md, A signed check): `{ ok, why, read: [{ hash, held, concerns, stage }] }`. The signer answers for its word; this says whether the blocks are there and are what it says. */
const checkReads = (check, blocks) => door.checkReads(check, blocks)
/** A circle of IOUs cancelled (promises.md, Clearing): `{ binds, why, who, missing, lines: [{ deal, ok, why, to_come, reduce, left }] }`. Binds only when everyone in it has signed; each line reduces a deal, in its own kind unless a rate both sides signed is named. */
const clearingApplied = (clearing, blocks) => door.clearingApplied(clearing, blocks)
/** Whether a judge's ruling releases a stake that names it (promises.md, Rulings): `{ releases, to, amount, ruling, why }`. No reader's clock (1.9 R-C1):
 * the judge's head ruling is read in the past of the stake's relying block (R-H9). */
const rulingReleases = (stake, blocks) => door.rulingReleases(stake, blocks)
/** What of `person`'s would become whose if `block` stands (promises.md, What becomes whose): `{ gives: [{ what | amount, to, back, held }], bench }` (`held`: a draw that holds that instance from its signer's word, 1.9 R-H1; `bench`: the deal's bench, as `promise_stage` gives it, or `none`), read only from the block's typed terms and refs, never from any schema's words. `back` is the time it comes back, or null (it cannot be counted on to). `person` is an id or a block. */
const gives = (block, person, blocks) => door.gives(block, idOf(person), blocks)
const membersThen = door.membersThen
/** Who owns an instance (folds.md, Ownership): read from the blocks alone, no clock (1.9 3c-6; a reader's clock is the view's, `ownershipView`). */
const ownership = (instance, blocks) => door.ownership(blockOf(instance), blocks)
/** The ownership view: the same fold read at the reader's clock `now`. */
const ownershipView = (instance, blocks, { now } = {}) => door.ownershipView(blockOf(instance), blocks, now || null)
/** What was made from an instance (folds.md, What each fold returns): `[{ thing, from, make, took }]`, along the makes that took from it, sorted by thing then make. */
const madeFrom = (instance, blocks) => door.madeFrom(blockOf(instance), blocks)
const ownerOf = (instance, blocks) => door.ownerOf(blockOf(instance), blocks)
const receiverOf = door.receiverOf
const whereNow = (thing, blocks) => door.whereNow(blockOf(thing), blocks)
const sharesOn = (thing, blocks) => door.sharesOn(blockOf(thing), blocks)
const notFreeShown = (block, blocks) => door.notFreeShown(blockOf(block), blocks)
const invasionShown = (claim, blocks) => door.invasionShown(blockOf(claim), blocks)
/** A pot read from its head block and the blocks held; no clock (1.9 3c-6). */
const pot = (head, blocks) => door.pot(blockOf(head), blocks)
/** Where `who` says money to them goes (promises.md, Where to pay me): `{ who, destinations: [{ destination, by }], hash, at }` from the head of their account words (the one no other of theirs has in its causal past), or null when there is none, two heads do not see each other, or the head lists no place. */
const accountOf = (who, blocks) => door.accountOf(idOf(who), blocks)
const releaseShown = (subject, blocks) => door.releaseShown(blockOf(subject), blocks)
const useShown = (place, blocks, clocks) => door.useShown(blockOf(place), blocks, clocks)
/** The consent fold: a person's live word about a sender (or none): { word, block }. `under`: the grant the sender's block acts under; a word about its grantor is a word about the sender (consent follows the principal). */
const consent = (person, sender, blocks, under) => door.consent(person, sender || null, blocks, under || null)
// Views, each saying whose clock or arrivals it reads.
const due = (promise, { arrivedAt } = {}) => door.due(promise, arrivals(arrivedAt, [promise], list(promise && promise.state && promise.state.when && promise.state.when.after ? [{ hash: promise.state.when.after }] : [])))
/** A circle's versions and who is on each (circles.md, Versions): `{ circle, versions, members, rules }`; null for a block that is not a circle's founding block. */
const circleVersions = (circle, blocks) => door.circleVersions(idOf(circle), blocks)
/** Is a machine locked now (authority.md, A machine lock): `{ locked, locks, lifted }`. `now` is the time read at (none: only a lock that needs no clock stands). */
const machineLock = (machine, blocks, { now } = {}) => door.machineLock(machine, blocks, now || null)
/** What a judge's offer gives back of her fee (promises.md, Rulings): `{ settled, releases, to_come, why }` (1.9: `owed` is `to_come`). */
const feeBack = (offer, deal, blocks) => door.feeBack(offer, deal, blocks)
/** A threshold read against a set of `members` voices (folds.md, Counts): `needed` is a whole number, `all`, or `{ of_members: "p/q" }`. The number of voices it asks for, or null when it names no count (none is ever filled in). */
const countOf = (needed, members) => door.countOf(needed ?? null, members)
const circleKey = (circle, blocks) => door.circleKey(idOf(circle), blocks)
const countedIn = (result, commitment, counter) => door.countedIn(result ?? null, String(commitment), String(counter))

/** 1.9 stage 6: whether a row of the circle a block is `as` holds for it (circles.md); the fewest hands each row needs (a reading). */
const rowHolds = (block, blocks) => door.rowHolds(block, blocks)
const waysIn = (circle, blocks) => door.waysIn(idOf(circle), blocks)
/** 1.9 stage 4: keeps to, the meter, the worst case and the lowest offer of a grant (authority.md). */
const keepsTo = (c, a, blocks) => door.keepsTo(c, a, blocks)
const meter = (grant, blocks, block) => door.meter(grant, blocks, block)
const worstCase = (grant, blocks) => door.worstCase(grant, blocks)
const lowestOffer = (grant, blocks) => door.lowestOffer(grant, blocks)
/** 1.9 stage 7 (Job C), readings: the read-back of a block to the person `to` ({ answer, text, state }); a renderer's words for an answer; a second reader's redo ({ same, readback, lacks, not_run }). */
const readback = (block, blocks, { to, renderer, digits } = {}) => door.readback(block, blocks, to, renderer, digits)
const render = (answer, renderer) => door.render(answer, renderer)
const readbackRedo = (rb, blocks) => door.readbackRedo(rb, blocks)
module.exports = { rowHolds, waysIn, keepsTo, meter, worstCase, lowestOffer, readback, render, readbackRedo, repeatOccurrences, promiseStage, promiseView, promiseViews, circleState, speaksFor, backed, backedAll, toComeBack, listingCheck, checkReads, clearingApplied, rulingReleases, gives, membersThen, ownership, ownershipView, madeFrom, ownerOf, receiverOf, whereNow, sharesOn, notFreeShown, invasionShown, pot, accountOf, releaseShown, useShown, consent, due, circleKey, countedIn, circleVersions, machineLock, feeBack, countOf }
