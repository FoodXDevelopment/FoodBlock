// Authority (modules/authority.md): a grant gives authority within a scope; a child is a subset of its parent; a grant
// is live only while every ancestor is. Durations count calendar months and years in UTC. The rules run in the Rust core.
const door = require('./door.cjs')

const parseDuration = (text) => door.parseDuration(typeof text === 'string' ? text : null)
/** A time moved by a duration (sign -1 goes back), months and years by the UTC calendar. null when either is not one. */
const addDuration = (time, duration, sign = 1) => door.addDuration(String(time), String(duration), sign)
/** Two durations compared by adding both to one instant (§7): -1, 0 or 1. */
const compareDurations = door.compareDurations
const scopeRefusals = door.scopeRefusals
const scopeWithin = door.scopeWithin
const whyNotLive = (grant, blocks, { now } = {}) => door.whyNotLive(grant || null, blocks, now || null)
const isLive = (grant, blocks, { now } = {}) => Boolean(grant) && door.isLive(grant, blocks, now || null)
const ancestors = door.ancestors
const whyNotUnder = (block, blocks, { now } = {}) => door.whyNotUnder(block || null, blocks, now || null)
/** Who answers for an autonomous system or machine: the authors of its live grants of kind operator (§2). */
const operatorsOf = (agent, blocks, { now } = {}) => door.operatorsOf(agent, blocks, now || null)
/** Why an act that cannot be undone (its schema says `undo: never`) is not live: [] when it has a specific accepted ask or a grant that names it with a limit. */
const whyNotLiveUndo = door.whyNotLiveUndo
/** The act a block is, named `type.kind`. */
const actName = door.actName
/** The `observe` of kind limit for a grant: what to hand `write` (its type, state, refs and audience). */
const limitFence = (grantHash, agent, { limit, every, salt, each } = {}) => door.limitFence(grantHash, agent, limit ?? null, every || null, salt || null, each ?? null)
/** The commitment to a limit and a cap on each act (authority.md): put it in the grant's `scope.limit_commitment`; keep `salt` with the limit observe. */
const limitCommitment = (limit, every, salt, suite, each) => door.limitCommitment(limit ?? null, every || null, salt, suite || null, each ?? null)
/** Whether the limit observe opens the grant's `scope.limit_commitment` (the principal's node and the agent make this check). */
const limitOpens = (grant, fence, suite) => door.limitOpens(grant, fence, suite || null)
/** Whether one act of `value` (money or an amount) stays inside a limit (authority.md); `spent` is what was counted in the period: minor units, or the amount's value (a whole number or a decimal string). */
const withinLimit = (limit, value, spent) => {
  // what was already spent is the caller's to state: a missing amount is never read as nothing spent (silence only narrows)
  if (spent === undefined || spent === null) throw new TypeError('withinLimit: spent is required: what the principal\'s node has counted in the period (0 when nothing)')
  return door.withinLimit(limit ?? null, value ?? null, spent)
}
/** What a promise's terms come to at a chosen quantity (else the terms'): { minor, currency }, or null when it cannot be computed. */
const termsTotal = (terms, quantity = null) => door.termsTotal(terms ?? null, quantity ?? null)
/** Whether a child grant's limit keeps to its parent's (authority.md): both limit observes (or { limit, every, each }), periods added to `at`, the parent grant's at. */
const limitWithinParent = (child, parent, at) => door.limitWithinParent(child ?? null, parent ?? null, at ?? null)

module.exports = { limitFence, limitCommitment, limitOpens, withinLimit, termsTotal, limitWithinParent, whyNotLiveUndo, actName, parseDuration, addDuration, compareDurations, scopeRefusals, scopeWithin, whyNotLive, isLive, ancestors, whyNotUnder, operatorsOf }
