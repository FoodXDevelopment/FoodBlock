// Authority (spec/protocol.md §7): a grant gives authority within a scope; a child is a subset of its parent; a grant
// is live only while every ancestor is. Durations count calendar months and years in UTC. The rules run in the Rust core.
const { call, list } = require('./core.cjs')

const parseDuration = (text) => call('parse_duration', typeof text === 'string' ? text : null)
/** A time moved by a duration (sign -1 goes back), months and years by the UTC calendar. null when either is not one. */
const addDuration = (time, duration, sign = 1) => call('add_duration', String(time), String(duration), sign)
/** Two durations compared by adding both to one instant (§7): -1, 0 or 1. */
const compareDurations = (a, b, from) => call('compare_durations', a, b, from)
const scopeRefusals = (child, parent) => call('scope_refusals', child, parent)
const scopeWithin = (child, parent) => call('scope_within', child, parent)
const whyNotLive = (grant, blocks, { now } = {}) => call('why_not_live', grant || null, list(blocks), now || null)
const isLive = (grant, blocks, { now } = {}) => Boolean(grant) && call('is_live', grant, list(blocks), now || null)
const ancestors = (grant, blocks) => call('ancestors', grant, list(blocks))
const whyNotUnder = (block, blocks, { now } = {}) => call('why_not_under', block || null, list(blocks), now || null)
/** Who answers for an agent or machine: the authors of its live grants of kind operator (§2). */
const operatorsOf = (agent, blocks, { now } = {}) => call('operators_of', agent, list(blocks), now || null)
/** The `observe` of kind limit for a grant: what to hand `write` (its type, state, refs and audience). */
const limitFence = (grantHash, agent, { limit, per } = {}) => call('limit_fence', grantHash, agent, limit ?? null, per || null)
/** Whether spending `money` stays inside a limit (§7). */
const withinLimit = (limit, money, spent = 0) => call('within_limit', limit ?? null, money ?? null, spent)

module.exports = { limitFence, withinLimit, parseDuration, addDuration, compareDurations, scopeRefusals, scopeWithin, whyNotLive, isLive, ancestors, whyNotUnder, operatorsOf }
