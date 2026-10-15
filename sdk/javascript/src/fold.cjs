// The folds (spec/protocol.md §11): a set of blocks read into one answer, the same on every node from the same blocks.
// The rules run in the Rust core.
const { call, list, arrivals } = require('./core.cjs')

// A circle, or a thing, may be given as its block or as its hash.
const idOf = (x) => (x && x.hash) || x
const blockOf = (x) => (typeof x === 'string' ? { hash: x } : x)

/** A promise's stage, from its first promise and every block in its deal. Options: `now`, `confirmers`. */
const promiseStage = (firstBlock, blocks, { now, confirmers = [] } = {}) => call('promise_stage', firstBlock, list(blocks), { now, confirmers })
/** A circle's members and roles. Options: `within` (a block: fold only its causal past). */
const circleState = (circle, blocks, { within } = {}) => call('circle_state', idOf(circle), list(blocks), within || null)
const mayActAs = (block, circle, blocks, role) => call('may_act_as', block, idOf(circle), list(blocks), role || null)
const membersThen = (block, recipient, blocks) => call('members_then', block, recipient, list(blocks))
const ownership = (instance, blocks) => call('ownership', blockOf(instance), list(blocks))
const ownerOf = (instance, blocks) => call('owner_of', blockOf(instance), list(blocks))
const receiverOf = (promise, blocks) => call('receiver_of', promise, list(blocks))
const whereNow = (thing, blocks) => call('where_now', blockOf(thing), list(blocks))
const successorState = (grant, blocks, { now, arrivedAt } = {}) => call('successor_state', grant, list(blocks), now || null, arrivals(arrivedAt, blocks))
const circleKey = (circle, blocks) => call('circle_key', idOf(circle), list(blocks))
const countedIn = (result, commitment, counter) => call('counted_in', result ?? null, String(commitment), String(counter))
const sequencerOf = (record) => call('sequencer_of', record)

module.exports = { promiseStage, circleState, mayActAs, membersThen, ownership, ownerOf, receiverOf, whereNow, successorState, circleKey, countedIn, sequencerOf }
